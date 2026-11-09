import { Injectable, Logger } from '@nestjs/common';
import { NotificationClient } from '../notifications/notification.client';
import { NotificationChannel } from '../notifications/notification.contract';
import { validateTopic } from './sse.topics';

/**
 * Emits signals for the UI over SSE: `sse.emit('agenda.salon-angel.no-team.2030-06-20', { type: 'booked', … })`.
 *
 * SSE is one more channel of the notifications service, next to email: this is `NotificationClient.emit(SSE, …)`
 * with a signal as the content. The notifications service, which holds the open connections of the browsers,
 * delivers it to whoever is listening to a matching pattern. A service that emits needs nothing else: no Redis,
 * no connection of its own.
 *
 * Nothing is stored for the browsers: a signal nobody was listening to is lost, and the next time the UI asks the
 * API it sees the truth. Therefore:
 * - call it AFTER the transaction that caused it committed;
 * - it never throws: it must not slow down or undo what caused it.
 */
@Injectable()
export class SseService {
  private readonly logger = new Logger(SseService.name);

  constructor(private readonly notifications: NotificationClient) {}

  /** @returns true when Kafka took the signal */
  async emit(topic: string, data: Record<string, unknown>): Promise<boolean> {
    const problem = validateTopic(topic);
    if (problem) {
      this.logger.error(`Signal not emitted: ${problem} (${String(topic).slice(0, 80)})`);
      return false;
    }
    const sent = await this.notifications.emit(NotificationChannel.SSE, { signal: { topic, data }, category: 'transactional' });
    return sent !== null;
  }

  /** The same signal for several topics (an appointment that touches two days). @returns how many Kafka took */
  async emitMany(topics: string[], data: Record<string, unknown>): Promise<number> {
    const results = await Promise.all([...new Set(topics)].map((topic) => this.emit(topic, data)));
    return results.filter(Boolean).length;
  }
}
