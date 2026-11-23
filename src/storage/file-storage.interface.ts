/**
 * File Storage Service - Abstract Contract
 *
 * Defines the contract for file storage operations.
 * Implementations (strategies) handle provider-specific logic (Supabase, S3, etc.).
 */

export interface UploadFileOptions {
  contentType?: string;
  upsert?: boolean;
  cacheControl?: string;
}

export interface FileUploadResult {
  url: string;
  path: string;
}

export interface ListFilesOptions {
  limit?: number;
  offset?: number;
  search?: string;
}

/** What the client needs to send a file straight to the storage (a presigned POST): the address and the form fields, in that order */
export interface UploadTicket {
  url: string;
  fields: Record<string, string>;
  expiresAt: Date;
}

export interface UploadTicketOptions {
  /** The exact content type the upload must declare */
  contentType: string;
  /** Largest file the storage accepts through this ticket */
  maxBytes: number;
  /** Seconds the ticket is valid */
  expiresIn: number;
}

/**
 * Abstract class defining the file storage contract.
 * All storage providers must implement this interface.
 */
export abstract class FileStorageService {
  /**
   * Upload a file to storage
   *
   * @param bucket - Storage bucket/container name
   * @param filePath - Full path within the bucket
   * @param file - File buffer
   * @param options - Upload options
   * @returns Upload result with URL and path
   */
  abstract uploadFile(
    bucket: string,
    filePath: string,
    file: Buffer,
    options?: UploadFileOptions,
  ): Promise<FileUploadResult>;

  /**
   * Delete a single file
   *
   * @param bucket - Storage bucket name
   * @param filePath - Full path within the bucket
   */
  abstract deleteFile(bucket: string, filePath: string): Promise<void>;

  /**
   * Delete multiple files
   *
   * @param bucket - Storage bucket name
   * @param filePaths - Array of file paths
   */
  abstract deleteFiles(bucket: string, filePaths: string[]): Promise<void>;

  /**
   * Get public URL for a file
   *
   * @param bucket - Storage bucket name
   * @param filePath - Full path within the bucket
   * @returns Public URL
   */
  abstract getPublicUrl(bucket: string, filePath: string): string;

  /**
   * Get signed URL for private files
   *
   * @param bucket - Storage bucket name
   * @param filePath - Full path within the bucket
   * @param expiresIn - Expiration time in seconds
   * @returns Signed URL
   */
  abstract getSignedUrl(
    bucket: string,
    filePath: string,
    expiresIn?: number,
  ): Promise<string>;

  /**
   * A ticket for the client to upload ONE file straight to the storage, without it going through the service (a function cannot take
   * a body over ~6 MB). The storage itself enforces the key, the content type and the size range; what the file really is must still be
   * checked afterwards (`UploadTicketService.confirm`): nothing the client says about it is trusted.
   */
  abstract createUploadTicket(bucket: string, filePath: string, options: UploadTicketOptions): Promise<UploadTicket>;

  /** Size in bytes of a stored file, or null when it is not there */
  abstract getFileSize(bucket: string, filePath: string): Promise<number | null>;

  /** The first `bytes` bytes of a stored file (enough to recognize its type without downloading it) */
  abstract readHead(bucket: string, filePath: string, bytes: number): Promise<Buffer>;

  /** Copies a file inside a bucket (the original stays: delete it after) */
  abstract copyFile(bucket: string, fromPath: string, toPath: string, options?: { contentType?: string }): Promise<void>;

  /**
   * List files in a bucket folder
   *
   * @param bucket - Storage bucket name
   * @param path - Folder path (optional)
   * @param options - List options
   * @returns List of files
   */
  abstract listFiles(
    bucket: string,
    path?: string,
    options?: ListFilesOptions,
  ): Promise<any[]>;
}
