import { Module, Global } from '@nestjs/common';
import { FileStorageService } from './file-storage.interface';
import { SupabaseStorageStrategy } from './strategies/supabase-storage.strategy';
import { SharedConfigService } from '../config/env.config';

/**
 * Storage Module
 *
 * Provides FileStorageService using Strategy Pattern.
 * The actual strategy is determined at runtime based on STORAGE_PROVIDER env var.
 *
 * Supported providers:
 * - 'supabase' (default): SupabaseStorageStrategy
 * - 's3' (future): S3StorageStrategy
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
        const provider = config.get('STORAGE_PROVIDER') || 'supabase';

        switch (provider) {
          case 'supabase':
            return new SupabaseStorageStrategy(config);
          // Future providers:
          // case 's3':
          //   return new S3StorageStrategy(config);
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
