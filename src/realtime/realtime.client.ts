import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { SharedConfigService } from '../config/env.config';
import { validateTopic } from './realtime.topics';

/** The Redis channel every real-time signal travels on; each instance of the hub listens to it */
export const REALTIME_CHANNEL = 'realtime:events';

/** What travels on the channel */
export interface RealtimeEnvelope {
  topic: string;
  data: Record<string, unknown>;
  /** ISO instant the signal was emitted */
  at: string;
}

/** A signal is a hint, not a record: a big payload is a mistake */
export const MAX_SIGNAL_BYTES = 2048;

/**
 * Emits real-time signals for the UI: `realtime.emit('agenda.salon-angel.no-team.2030-06-20', { type: 'booked', … })`.
 *
 * It publishes to Redis pub/sub (shared infrastructure every service already has); the notifications service,
 * which holds the open SSE connections, hears it and writes it to whoever subscribed to a matching pattern.
 *
 * Fire and forget by design: nothing is stored, so a signal that nobody heard (nobody was watching, Redis was
 * down) is simply lost, and the next time the UI asks the API it sees the truth. Therefore:
 * - call it AFTER the transaction that caused it committed;
 * - it never throws and never waits for Redis for long: it must not slow down or undo what caused it.
 */
@Injectable()
export class RealtimeClient implements OnModuleDestroy {
  private readonly logger = new Logger(RealtimeClient.name);
  private redis?: Redis;
  private failureLogged = false;

  constructor(private readonly config: SharedConfigService) {}

  /** @returns true when the signal was handed to Redis */
  async emit(topic: string, data: Record<string, unknown>): Promise<boolean> {
    const problem = validateTopic(topic);
    if (problem) {
      this.logger.error(`Signal not emitted: ${problem} (${String(topic).slice(0, 80)})`);
      return false;
    }

    const message = JSON.stringify({ topic, data, at: new Date().toISOString() } satisfies RealtimeEnvelope);
    if (Buffer.byteLength(message) > MAX_SIGNAL_BYTES) {
      this.logger.error(`Signal ${topic} not emitted: it is bigger than ${MAX_SIGNAL_BYTES} bytes`);
      return false;
    }

    try {
      await this.connection().publish(REALTIME_CHANNEL, message);
      this.failureLogged = false;
      return true;
    } catch (error) {
      // Once per outage: a Redis that is down must not fill the log with one line per booking
      if (!this.failureLogged) {
        this.logger.warn(`Signals are not reaching Redis: ${(error as Error).message}`);
        this.failureLogged = true;
      }
      return false;
    }
  }

  /** The same signal for several topics (an appointment that touches two days). Returns how many were handed over. */
  async emitMany(topics: string[], data: Record<string, unknown>): Promise<number> {
    const results = await Promise.all([...new Set(topics)].map((topic) => this.emit(topic, data)));
    return results.filter(Boolean).length;
  }

  async onModuleDestroy(): Promise<void> {
    await this.redis?.quit().catch(() => undefined);
  }

  /**
   * One lazy connection per process. With the offline queue off, a publish while Redis is down fails at once instead
   * of piling up in memory waiting for it.
   */
  private connection(): Redis {
    if (!this.redis) {
      const { host, port, password } = this.config.redis;
      this.redis = new Redis({ host, port, password, lazyConnect: false, enableOfflineQueue: false, maxRetriesPerRequest: 1 });
      this.redis.on('error', () => undefined); // reported by the failed publish, once
    }
    return this.redis;
  }
}
