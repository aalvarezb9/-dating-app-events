/**
 * File Storage Module
 *
 * Exports:
 * - FileStorageService: Abstract contract for file storage operations
 * - S3StorageStrategy: Concrete implementation for S3
 * - StorageModule: Module configuration with provider
 */

// Abstract contract and interfaces
export * from './file-storage.interface';

// Concrete strategies
export * from './strategies/s3-storage.strategy';

// Module
export * from './storage.module';
