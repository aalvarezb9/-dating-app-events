import { Injectable, Logger } from '@nestjs/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { SharedConfigService } from '../config/env.config';

export interface UploadResult {
  url: string;
  path: string;
  bucket: string;
}

export interface UploadOptions {
  contentType?: string;
  upsert?: boolean;
  cacheControl?: string;
}

/**
 * Supabase Storage Service
 *
 * Provides file upload, download, and management functionality using Supabase Storage.
 * Replaces AWS S3 in the Railway + Supabase stack.
 *
 * Features:
 * - Public and private buckets
 * - Automatic public URL generation
 * - File upload with content type
 * - File deletion
 * - RLS (Row Level Security) support
 *
 * @example
 * ```typescript
 * @Injectable()
 * export class LandingPageService {
 *   constructor(private storageService: SupabaseStorageService) {}
 *
 *   async uploadHeroImage(tenantId: string, file: Buffer) {
 *     const result = await this.storageService.uploadFile(
 *       'landing-pages',
 *       `${tenantId}/hero/image.jpg`,
 *       file,
 *       { contentType: 'image/jpeg' }
 *     );
 *     return result.url;
 *   }
 * }
 * ```
 */
@Injectable()
export class SupabaseStorageService {
  private readonly supabase: SupabaseClient;
  private readonly logger = new Logger(SupabaseStorageService.name);

  constructor(private config: SharedConfigService) {
    const supabaseConfig = this.config.supabase;

    this.supabase = createClient(
      supabaseConfig.url,
      supabaseConfig.serviceRoleKey, // Use service role for backend operations
    );

    this.logger.log(`SupabaseStorageService initialized: ${supabaseConfig.storageUrl}`);
  }

  /**
   * Upload a file to Supabase Storage
   *
   * @param bucket - The bucket name (e.g., 'landing-pages', 'business-documents')
   * @param filePath - The full path within the bucket (e.g., 'tenant-123/hero/image.jpg')
   * @param file - The file buffer to upload
   * @param options - Optional upload options (contentType, upsert, cacheControl)
   * @returns Upload result with public URL and path
   */
  async uploadFile(
    bucket: string,
    filePath: string,
    file: Buffer,
    options?: UploadOptions
  ): Promise<UploadResult> {
    try {
      const { data, error } = await this.supabase.storage
        .from(bucket)
        .upload(filePath, file, {
          contentType: options?.contentType,
          upsert: options?.upsert ?? false,
          cacheControl: options?.cacheControl ?? '3600',
        });

      if (error) {
        this.logger.error(`Upload failed: ${error.message}`, error);
        throw new Error(`Failed to upload file: ${error.message}`);
      }

      const publicUrl = this.getPublicUrl(bucket, filePath);

      this.logger.log(`File uploaded successfully: ${bucket}/${filePath}`);

      return {
        url: publicUrl,
        path: data.path,
        bucket,
      };
    } catch (error: any) {
      this.logger.error(`Upload error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Delete a file from Supabase Storage
   *
   * @param bucket - The bucket name
   * @param filePath - The full path within the bucket
   */
  async deleteFile(bucket: string, filePath: string): Promise<void> {
    try {
      const { error } = await this.supabase.storage
        .from(bucket)
        .remove([filePath]);

      if (error) {
        this.logger.error(`Delete failed: ${error.message}`, error);
        throw new Error(`Failed to delete file: ${error.message}`);
      }

      this.logger.log(`File deleted successfully: ${bucket}/${filePath}`);
    } catch (error: any) {
      this.logger.error(`Delete error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Delete multiple files from Supabase Storage
   *
   * @param bucket - The bucket name
   * @param filePaths - Array of file paths to delete
   */
  async deleteFiles(bucket: string, filePaths: string[]): Promise<void> {
    try {
      const { error } = await this.supabase.storage
        .from(bucket)
        .remove(filePaths);

      if (error) {
        this.logger.error(`Batch delete failed: ${error.message}`, error);
        throw new Error(`Failed to delete files: ${error.message}`);
      }

      this.logger.log(`Files deleted successfully: ${bucket}/ (${filePaths.length} files)`);
    } catch (error: any) {
      this.logger.error(`Batch delete error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get public URL for a file
   *
   * @param bucket - The bucket name
   * @param filePath - The full path within the bucket
   * @returns Public URL to access the file
   */
  getPublicUrl(bucket: string, filePath: string): string {
    const { data } = this.supabase.storage
      .from(bucket)
      .getPublicUrl(filePath);

    return data.publicUrl;
  }

  /**
   * Get signed URL for private files (expires after specified time)
   *
   * @param bucket - The bucket name
   * @param filePath - The full path within the bucket
   * @param expiresIn - Expiration time in seconds (default: 3600 = 1 hour)
   * @returns Signed URL with expiration
   */
  async getSignedUrl(bucket: string, filePath: string, expiresIn: number = 3600): Promise<string> {
    try {
      const { data, error } = await this.supabase.storage
        .from(bucket)
        .createSignedUrl(filePath, expiresIn);

      if (error) {
        this.logger.error(`Failed to generate signed URL: ${error.message}`, error);
        throw new Error(`Failed to generate signed URL: ${error.message}`);
      }

      return data.signedUrl;
    } catch (error: any) {
      this.logger.error(`Signed URL error: ${error.message}`);
      throw error;
    }
  }

  /**
   * List files in a bucket folder
   *
   * @param bucket - The bucket name
   * @param path - The folder path (optional)
   * @param options - List options (limit, offset, search)
   * @returns List of files
   */
  async listFiles(
    bucket: string,
    path: string = '',
    options?: { limit?: number; offset?: number; search?: string }
  ) {
    try {
      const { data, error } = await this.supabase.storage
        .from(bucket)
        .list(path, {
          limit: options?.limit ?? 100,
          offset: options?.offset ?? 0,
          search: options?.search,
        });

      if (error) {
        this.logger.error(`List files failed: ${error.message}`, error);
        throw new Error(`Failed to list files: ${error.message}`);
      }

      return data;
    } catch (error: any) {
      this.logger.error(`List files error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Extract bucket and path from a full Supabase Storage URL
   *
   * @param url - Full Supabase Storage URL
   * @returns Object with bucket and filePath, or null if invalid
   */
  extractPathFromUrl(url: string): { bucket: string; filePath: string } | null {
    try {
      // URL format: https://xxx.supabase.co/storage/v1/object/public/bucket-name/path/to/file
      const urlObj = new URL(url);
      const pathParts = urlObj.pathname.split('/');

      // Find 'public' or 'sign' in path
      const publicIndex = pathParts.indexOf('public');
      const signIndex = pathParts.indexOf('sign');
      const storageIndex = Math.max(publicIndex, signIndex);

      if (storageIndex === -1 || storageIndex + 1 >= pathParts.length) {
        return null;
      }

      const bucket = pathParts[storageIndex + 1];
      const filePath = pathParts.slice(storageIndex + 2).join('/');

      return { bucket, filePath };
    } catch (error) {
      this.logger.warn(`Failed to parse URL: ${url}`);
      return null;
    }
  }
}
