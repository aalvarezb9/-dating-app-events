import { Global, Module } from '@nestjs/common';
import { SseService } from './sse.service';

/**
 * Gives a service the `SseService`. Needs `EventsModule` and `SharedConfigModule` (both global).
 *
 * @example
 * imports: [SharedConfigModule, EventsModule, SseModule]
 * // then: await this.sse.emit('agenda.salon.no-team.2030-06-20', { type: 'booked', ... })
 *
 * The stream the browsers open (GET /sse/stream) is served by backend-dating-notifications.
 */
@Global()
@Module({
  providers: [SseService],
  exports: [SseService],
})
export class SseModule {}
