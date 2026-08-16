import { Module, Global } from '@nestjs/common';
import { EventPublisher } from './services/event-publisher.service';
import { SharedConfigModule } from './config/shared-config.module';

/**
 * Global Events Module for Dating App
 * Provides event publishing capabilities to all microservices
 *
 * Uses SharedConfigModule for environment configuration.
 *
 * @example
 * ```typescript
 * // In app.module.ts
 * @Module({
 *   imports: [
 *     SharedConfigModule,
 *     EventsModule,
 *     ...
 *   ],
 * })
 * export class AppModule {}
 * ```
 */
@Global()
@Module({
  imports: [SharedConfigModule],
  providers: [EventPublisher],
  exports: [EventPublisher],
})
export class EventsModule {}
