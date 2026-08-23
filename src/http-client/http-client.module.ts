import { Module, Global } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';

/**
 * HttpClientModule
 *
 * Global module that provides HttpService for inter-service communication.
 * Import this module in services that need to make HTTP calls to other services.
 *
 * Usage in AppModule:
 * ```typescript
 * @Module({
 *   imports: [
 *     HttpClientModule, // Provides HttpService globally
 *     // ... other imports
 *   ],
 * })
 * export class AppModule {}
 * ```
 */
@Global()
@Module({
  imports: [
    HttpModule.register({
      timeout: 10000, // 10 seconds default
      maxRedirects: 5,
    }),
  ],
  exports: [HttpModule],
})
export class HttpClientModule {}
