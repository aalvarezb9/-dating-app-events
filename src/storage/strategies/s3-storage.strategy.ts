import { Injectable, Logger } from '@nestjs/common';
import {
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { SharedConfigService } from '../../config/env.config';
import { FileStorageService, FileUploadResult, ListFilesOptions, UploadFileOptions } from '../file-storage.interface';

/** S3 deletes at most this many keys per request */
const DELETE_BATCH = 1000;

/**
 * S3 Storage Strategy: implements `FileStorageService` on S3 (STORAGE_PROVIDER=s3).
 *
 * The code speaks in LOGICAL buckets (`payment-proofs`, `landing-pages`); the real bucket is `<S3_BUCKET_PREFIX><name>`, because bucket names
 * are global in AWS and each stage has its own. The public URL of a file uses the logical name behind `ASSETS_BASE_URL` (CloudFront has one
 * behavior per bucket); the private files are only ever reached with a signed URL.
 *
 * Against the emulator (`AWS_ENDPOINT_URL`) it addresses buckets in the path (`https://host/bucket/key`), which is what the emulator serves.
 */
@Injectable()
export class S3StorageStrategy extends FileStorageService {
  private readonly logger = new Logger(S3StorageStrategy.name);
  private readonly client: S3Client;
  private readonly prefix: string;
  private readonly assetsBaseUrl: string;

  constructor(config: SharedConfigService) {
    super();
    const s3 = config.s3;
    this.prefix = s3.bucketPrefix;
    this.assetsBaseUrl = s3.assetsBaseUrl;
    this.client = new S3Client({
      region: s3.region,
      ...(s3.endpoint ? { endpoint: s3.endpoint, forcePathStyle: true } : {}),
    });
    this.logger.log(`S3StorageStrategy initialized (buckets "${this.prefix}*")`);
  }

  private bucketOf(bucket: string): string {
    return `${this.prefix}${bucket}`;
  }

  async uploadFile(bucket: string, filePath: string, file: Buffer, options?: UploadFileOptions): Promise<FileUploadResult> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucketOf(bucket),
        Key: filePath,
        Body: file,
        ContentType: options?.contentType,
        CacheControl: options?.cacheControl ?? 'max-age=3600',
        // S3 overwrites by default; "no upsert" is the contract of the other provider: refuse to replace an existing object
        ...(options?.upsert === false ? { IfNoneMatch: '*' } : {}),
      }),
    );
    this.logger.log(`File uploaded: ${bucket}/${filePath}`);
    return { url: this.getPublicUrl(bucket, filePath), path: filePath };
  }

  async deleteFile(bucket: string, filePath: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucketOf(bucket), Key: filePath }));
  }

  async deleteFiles(bucket: string, filePaths: string[]): Promise<void> {
    for (let start = 0; start < filePaths.length; start += DELETE_BATCH) {
      const batch = filePaths.slice(start, start + DELETE_BATCH);
      await this.client.send(
        new DeleteObjectsCommand({ Bucket: this.bucketOf(bucket), Delete: { Objects: batch.map((Key) => ({ Key })), Quiet: true } }),
      );
    }
  }

  getPublicUrl(bucket: string, filePath: string): string {
    return `${this.assetsBaseUrl}/${bucket}/${filePath}`;
  }

  async getSignedUrl(bucket: string, filePath: string, expiresIn: number = 3600): Promise<string> {
    return getSignedUrl(this.client, new GetObjectCommand({ Bucket: this.bucketOf(bucket), Key: filePath }), { expiresIn });
  }

  async listFiles(bucket: string, path?: string, options?: ListFilesOptions): Promise<any[]> {
    const prefix = path ? `${path.replace(/\/+$/, '')}/` : undefined;
    const response = await this.client.send(
      new ListObjectsV2Command({ Bucket: this.bucketOf(bucket), Prefix: prefix, MaxKeys: options?.limit ?? 100 }),
    );
    const offset = options?.offset ?? 0;
    return (response.Contents ?? [])
      .filter((object) => !options?.search || (object.Key ?? '').includes(options.search))
      .slice(offset)
      .map((object) => ({ name: (object.Key ?? '').slice(prefix?.length ?? 0), path: object.Key, size: object.Size, lastModified: object.LastModified }));
  }
}
