import { Module, Global } from '@nestjs/common';
import { FileStorageService } from './file-storage.interface';
import { S3StorageStrategy } from './strategies/s3-storage.strategy';
import { SharedConfigService } from '../config/env.config';
import { UploadTicketService } from '../files/upload-tickets';

/**
 * Storage Module
 *
 * Provides FileStorageService using Strategy Pattern.
 * The actual strategy is determined at runtime based on STORAGE_PROVIDER env var.
 *
 * Supported providers:
 * - 's3': S3StorageStrategy
 *
 * To add a new provider:
 * 1. Create strategy class extending FileStorageService
 * 2. Add to useFactory switch case below
 */
@Global()
@Module({
  providers: [
    {
      provide: FileStorageService,
      useFactory: (config: SharedConfigService) => {
        const provider = config.storageProvider;

        switch (provider) {
          case 's3':
            return new S3StorageStrategy(config);
          default:
            throw new Error(`Unknown storage provider: ${provider}`);
        }
      },
      inject: [SharedConfigService],
    },
    // Uploads that go straight to the storage (presigned POST) and are checked afterwards: see files/upload-tickets.ts
    UploadTicketService,
  ],
  exports: [FileStorageService, UploadTicketService],
})
export class StorageModule {}
