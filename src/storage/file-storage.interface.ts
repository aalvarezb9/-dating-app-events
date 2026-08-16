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
