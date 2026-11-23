import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SharedConfigService } from './env.config';

/**
 * Shared Configuration Module
 *
 * Provides global access to SharedConfigService across all modules.
 * Automatically loads .env files based on NODE_ENV.
 *
 * Supported environments:
 * - local: .env.local
 * - development: .env.dev
 * - production: .env.prod
 * - default: .env
 *
 * @example
 * ```typescript
 * // In app.module.ts
 * @Module({
 *   imports: [SharedConfigModule, ...],
 * })
 * export class AppModule {}
 *
 * // In any service
 * @Injectable()
 * export class MyService {
 *   constructor(private config: SharedConfigService) {
 *     const dbUrl = this.config.database.url;
 *   }
 * }
 * ```
 */
@Global()
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [
        `.env.${process.env.NODE_ENV}`,
        '.env',
        // Values that only exist once the infrastructure is deployed (the ids of the local User Pool); a file that is not there is skipped
        ...(process.env.EXTRA_ENV_FILE ? [process.env.EXTRA_ENV_FILE] : []),
      ],
      cache: true,
    }),
  ],
  providers: [SharedConfigService],
  exports: [SharedConfigService],
})
export class SharedConfigModule {}
