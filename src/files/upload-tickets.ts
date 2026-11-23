import { BadRequestException, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { FileStorageService } from '../storage/file-storage.interface';
import { MAX_FILE_SIZE_BYTES, UPLOAD_ERRORS } from './file-upload.constants';
import { DetectedFileType, detectFileType, generateStorageFileName } from './file-upload';

/** How long the client has to send the file once it has the ticket */
export const UPLOAD_TICKET_SECONDS = 600;

/** Enough bytes to recognize every supported type (the longest signature, WEBP, is 12) */
const HEAD_BYTES = 16;

/** What a path segment of a scope may be: ids and names, never a separator or a dot-dot */
const SAFE_SEGMENT = /^[A-Za-z0-9_-]+$/;
const UPLOAD_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface IssueUploadOptions {
  bucket: string;
  /**
   * What the file belongs to (`[tenantId, 'payment-proofs', appointmentId]`). The temporary key carries it, so a ticket can only be
   * confirmed by the request of the same resource: nobody can confirm an upload that was made for another one.
   */
  scope: string[];
  allowed: DetectedFileType[];
  /** What the client says it will send: checked against the allowed types now, and enforced by the storage on the upload */
  contentType: string;
  /** What the client says it will send: checked against the limit now, and enforced by the storage on the upload */
  sizeBytes: number;
}

export interface IssuedUpload {
  uploadId: string;
  url: string;
  /** The form fields to send before the file, in this order */
  fields: Record<string, string>;
  expiresAt: Date;
  maxBytes: number;
}

export interface ConfirmUploadOptions {
  bucket: string;
  scope: string[];
  uploadId: string;
  allowed: DetectedFileType[];
  /** Folder of the final file (`<tenantId>/<appointmentId>`): the name is generated, the client's is never used */
  finalPrefix: string;
}

export interface ConfirmedUpload {
  /** Where the validated file is now */
  path: string;
  detected: DetectedFileType;
  size: number;
}

/**
 * Uploads that go straight from the client to the storage (presigned POST), in two steps:
 *
 *  1. `issue`: the service has already applied ITS rules (whose appointment it is, whether the window is open, who may edit the landing
 *     page) and asks for a ticket. The file will be written to `incoming/<scope>/<uploadId>`, where nothing is served from.
 *  2. `confirm`: after the client uploaded, the service reads the real size and the first bytes, decides the type FROM THE CONTENT (what
 *     the client declared is not trusted), copies the file to its final, generated name and deletes the temporary one. A file that is not
 *     what it should be is deleted and refused, like the multipart upload did.
 *
 * It replaces the multipart upload: a function cannot take a body over ~6 MB, and the file never needs to cross the service.
 * Objects that were never confirmed expire by a lifecycle rule of the bucket on `incoming/`.
 */
@Injectable()
export class UploadTicketService {
  constructor(private readonly storage: FileStorageService) {}

  async issue(options: IssueUploadOptions): Promise<IssuedUpload> {
    if (!Number.isInteger(options.sizeBytes) || options.sizeBytes <= 0) {
      throw new BadRequestException(UPLOAD_ERRORS.FILE_REQUIRED);
    }
    if (options.sizeBytes > MAX_FILE_SIZE_BYTES) {
      throw new BadRequestException(UPLOAD_ERRORS.FILE_SIZE_EXCEEDED);
    }
    if (!options.allowed.some((type) => type.mimeType === options.contentType)) {
      throw new BadRequestException(UPLOAD_ERRORS.INVALID_FILE_TYPE);
    }

    const uploadId = randomUUID();
    const ticket = await this.storage.createUploadTicket(options.bucket, this.incomingKey(options.scope, uploadId), {
      contentType: options.contentType,
      maxBytes: MAX_FILE_SIZE_BYTES,
      expiresIn: UPLOAD_TICKET_SECONDS,
    });
    return { uploadId, ...ticket, maxBytes: MAX_FILE_SIZE_BYTES };
  }

  async confirm(options: ConfirmUploadOptions): Promise<ConfirmedUpload> {
    if (!UPLOAD_ID.test(options.uploadId)) {
      throw new BadRequestException(UPLOAD_ERRORS.FILE_REQUIRED);
    }
    const key = this.incomingKey(options.scope, options.uploadId);

    const size = await this.storage.getFileSize(options.bucket, key);
    if (size === null || size === 0) {
      // Nothing was uploaded (or an empty file): there is nothing to delete that matters
      await this.discard(options.bucket, key);
      throw new BadRequestException(UPLOAD_ERRORS.FILE_REQUIRED);
    }
    if (size > MAX_FILE_SIZE_BYTES) {
      await this.discard(options.bucket, key);
      throw new BadRequestException(UPLOAD_ERRORS.FILE_SIZE_EXCEEDED);
    }

    const detected = detectFileType(await this.storage.readHead(options.bucket, key, HEAD_BYTES));
    if (!detected || !options.allowed.some((type) => type.mimeType === detected.mimeType)) {
      await this.discard(options.bucket, key);
      throw new BadRequestException(UPLOAD_ERRORS.INVALID_FILE_TYPE);
    }

    const path = `${options.finalPrefix}/${generateStorageFileName(detected.extension)}`;
    await this.storage.copyFile(options.bucket, key, path, { contentType: detected.mimeType });
    await this.discard(options.bucket, key);
    return { path, detected, size };
  }

  /** Removes a file that was written by an upload that cannot be used: a failure to delete it is not the client's problem */
  private async discard(bucket: string, key: string): Promise<void> {
    await this.storage.deleteFile(bucket, key).catch(() => undefined);
  }

  private incomingKey(scope: string[], uploadId: string): string {
    if (scope.length === 0 || scope.some((segment) => !SAFE_SEGMENT.test(segment))) {
      throw new Error(`Unsafe upload scope: ${JSON.stringify(scope)}`);
    }
    return `incoming/${scope.join('/')}/${uploadId}`;
  }
}
