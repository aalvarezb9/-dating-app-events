import { randomUUID } from 'crypto';
import { Injectable, Logger } from '@nestjs/common';
import { SharedConfigService } from '../config/env.config';
import { EventPublisher } from '../services/event-publisher.service';
import { DomainEventType } from '../types/events';
import { validateTopic } from './sse.topics';

/** What travels in the Kafka event (`event.data`) */
export interface SseEnvelope {
  topic: string;
  data: Record<string, unknown>;
  /** ISO instant the signal was emitted: the hub drops a signal that arrives too late to be news */
  at: string;
}

/** A signal is a hint, not a record: a big payload is a mistake */
export const MAX_SIGNAL_BYTES = 2048;

/** The first two segments (`agenda.<business>`): signals of one business share a partition, so they arrive in order */
const partitionKeyOf = (topic: string): string => topic.split('.').slice(0, 2).join('.');

/**
 * Emits signals for the UI over SSE: `sse.emit('agenda.salon-angel.no-team.2030-06-20', { type: 'booked', … })`.
 *
 * It does what the notification client does: it publishes to Kafka and forgets. The notifications service, which
 * is the one that holds the open connections of the browsers, consumes the signal and writes it to whoever is
 * listening to a matching pattern. A service that emits needs nothing else: no Redis, no connection of its own.
 *
 * Nothing is stored for the browsers: a signal nobody was listening to is simply lost, and the next time the UI asks
 * the API it sees the truth. Therefore:
 * - call it AFTER the transaction that caused it committed;
 * - it never throws: it must not slow down or undo what caused it.
 */
@Injectable()
export class SseService {
  private readonly logger = new Logger(SseService.name);

  constructor(
    private readonly publisher: EventPublisher,
    private readonly config: SharedConfigService,
  ) {}

  /** @returns true when Kafka took the signal */
  async emit(topic: string, data: Record<string, unknown>): Promise<boolean> {
    const problem = validateTopic(topic);
    if (problem) {
      this.logger.error(`Signal not emitted: ${problem} (${String(topic).slice(0, 80)})`);
      return false;
    }

    const envelope: SseEnvelope = { topic, data, at: new Date().toISOString() };
    if (Buffer.byteLength(JSON.stringify(envelope)) > MAX_SIGNAL_BYTES) {
      this.logger.error(`Signal ${topic} not emitted: it is bigger than ${MAX_SIGNAL_BYTES} bytes`);
      return false;
    }

    try {
      await this.publisher.publishEventOrThrow(
        {
          eventType: DomainEventType.SSE_SIGNAL,
          eventId: randomUUID(),
          aggregateId: partitionKeyOf(topic),
          aggregateType: 'SseSignal',
          timestamp: new Date(),
          version: 1,
          data: envelope as unknown as Record<string, unknown>,
          metadata: { source: this.config.serviceName },
        },
        partitionKeyOf(topic),
      );
      return true;
    } catch (error) {
      this.logger.warn(`Signal ${topic} did not reach Kafka: ${(error as Error).message}`);
      return false;
    }
  }

  /** The same signal for several topics (an appointment that touches two days). @returns how many Kafka took */
  async emitMany(topics: string[], data: Record<string, unknown>): Promise<number> {
    const results = await Promise.all([...new Set(topics)].map((topic) => this.emit(topic, data)));
    return results.filter(Boolean).length;
  }
}
