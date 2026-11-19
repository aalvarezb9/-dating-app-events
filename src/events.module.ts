import { Module, Global } from '@nestjs/common';
import { EventPublisher } from './services/event-publisher.service';
import { QueueSender } from './messaging/queue-sender';
import { ScheduleClient } from './clients/schedule.client';
import { SharedConfigModule } from './config/shared-config.module';

/**
 * Global Events Module for Dating App
 * Provides everything a service needs to emit: `EventPublisher` (facts on its SNS topic), `QueueSender` (its own queues)
 * and the client of the service whose queues it sends to (`ScheduleClient`; `NotificationClient` is in `NotificationsModule`).
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
  providers: [EventPublisher, QueueSender, ScheduleClient],
  exports: [EventPublisher, QueueSender, ScheduleClient],
})
export class EventsModule {}
