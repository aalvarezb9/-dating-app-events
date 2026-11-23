import { Module, Global } from '@nestjs/common';
import { FileStorageService } from './file-storage.interface';
import { S3StorageStrategy } from './strategies/s3-storage.strategy';
import { SharedConfigService } from '../config/env.config';

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
  ],
  exports: [FileStorageService],
})
export class StorageModule {}
