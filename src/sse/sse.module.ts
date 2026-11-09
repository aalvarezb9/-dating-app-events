import { Global, Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module';
import { SseService } from './sse.service';

/**
 * Gives a service the `SseService`. Needs `EventsModule` and `SharedConfigModule` (both global).
 *
 * @example
 * imports: [SharedConfigModule, EventsModule, SseModule]
 * // then: await this.sse.emit('agenda.salon.no-team.2030-06-20', { type: 'booked', ... })
 *
 * The stream the browsers open (GET /sse/stream) is the SSE channel of backend-dating-notifications.
 */
@Global()
@Module({
  imports: [NotificationsModule],
  providers: [SseService],
  exports: [SseService],
})
export class SseModule {}
