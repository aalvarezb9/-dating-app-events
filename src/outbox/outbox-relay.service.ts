import { Inject, Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { DataSource, LessThan } from 'typeorm';
import { EventPublisher } from '../services/event-publisher.service';
import { AdvisoryLockManager } from '../database/advisory-lock-manager';
import { SharedConfigService } from '../config/env.config';
import { OutboxEvent } from './outbox-event.entity';

export const OUTBOX_OPTIONS = Symbol('OUTBOX_OPTIONS');

export interface OutboxOptions {
  /** Start the relay with the application (disable in tests or in processes that must not publish) */
  enabled?: boolean;
  /** Pause between polls when the outbox is empty */
  pollIntervalMs?: number;
  /** Events published per transaction */
  batchSize?: number;
  /** Failed deliveries before an event is parked as `failed` (visible, no longer retried) */
  maxAttempts?: number;
  /** Published rows older than this are deleted */
  retentionDays?: number;
}

const DEFAULTS: Required<OutboxOptions> = {
  enabled: true,
  pollIntervalMs: 1000,
  batchSize: 50,
  maxAttempts: 10,
  retentionDays: 7,
};

const CLEANUP_EVERY_MS = 60 * 60 * 1000;

/**
 * Publishes the outbox rows to Kafka, oldest first.
 *
 * - One relay publishes at a time per service database (transaction-level advisory lock), so
 *   the order of the events is preserved even with several instances of the service.
 * - A delivery failure stops the batch (the next poll retries it, order kept); after maxAttempts
 *   the event is parked as `failed` so one poison message never blocks the rest.
 * - Delivery is at-least-once: consumers must be idempotent (they are: eventId / sourceVersion).
 */
@Injectable()
export class OutboxRelay implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(OutboxRelay.name);
  private readonly options: Required<OutboxOptions>;
  private timer?: NodeJS.Timeout;
  private stopped = false;
  private lastCleanup = 0;

  constructor(
    private readonly dataSource: DataSource,
    private readonly publisher: EventPublisher,
    private readonly config: SharedConfigService,
    @Inject(OUTBOX_OPTIONS) options: OutboxOptions,
  ) {
    this.options = { ...DEFAULTS, ...options };
  }

  onApplicationBootstrap(): void {
    if (this.options.enabled) {
      this.schedule(0);
    }
  }

  onModuleDestroy(): void {
    this.stopped = true;
    if (this.timer) {
      clearTimeout(this.timer);
    }
  }

  private schedule(delayMs: number): void {
    if (this.stopped) {
      return;
    }
    this.timer = setTimeout(async () => {
      let published = 0;
      try {
        published = await this.drain();
        await this.cleanupIfDue();
      } catch (error: any) {
        this.logger.error(`Outbox relay failed: ${error?.message}`, error?.stack);
      }
      // Keep draining without pause while there is work
      this.schedule(published > 0 ? 0 : this.options.pollIntervalMs);
    }, delayMs);
    this.timer.unref?.();
  }

  /**
   * Publish one batch. Public so a service can force a flush (e.g. before shutting down).
   * @returns number of events published
   */
  async drain(): Promise<number> {
    const lockKey = AdvisoryLockManager.generateLockKey({
      resourceType: 'outbox-relay',
      namespace: this.config.serviceNamespace,
    });

    return this.dataSource.transaction(async (manager) => {
      const [{ locked }] = await manager.query('SELECT pg_try_advisory_xact_lock($1) AS locked', [lockKey]);
      if (!locked) {
        return 0; // another instance is publishing
      }

      const rows = await manager
        .getRepository(OutboxEvent)
        .createQueryBuilder('e')
        .where('e.status = :status', { status: 'pending' })
        .orderBy('e.id', 'ASC')
        .limit(this.options.batchSize)
        .getMany();

      let published = 0;
      for (const row of rows) {
        try {
          await this.publisher.publishEventOrThrow(row.payload, row.partitionKey);
          await manager.update(OutboxEvent, row.id, { status: 'published', publishedAt: new Date() });
          published++;
        } catch (error: any) {
          const attempts = row.attempts + 1;
          const parked = attempts >= this.options.maxAttempts;
          await manager.update(OutboxEvent, row.id, {
            attempts,
            lastError: String(error?.message ?? error).slice(0, 2000),
            ...(parked ? { status: 'failed' as const } : {}),
          });
          this.logger.warn(
            `Outbox event ${row.eventType} (${row.eventId}) not delivered (attempt ${attempts}/${this.options.maxAttempts}): ${error?.message}`,
          );
          if (parked) {
            // Nobody retries a parked event: this is the line an alert must be built on
            this.logger.error(
              `Outbox event ${row.eventType} (${row.eventId}) PARKED as failed after ${attempts} attempts and will not be retried: ${error?.message}`,
            );
          } else {
            break; // keep the order: retry this event before sending newer ones
          }
        }
      }
      return published;
    });
  }

  private async cleanupIfDue(): Promise<void> {
    const now = Date.now();
    if (now - this.lastCleanup < CLEANUP_EVERY_MS) {
      return;
    }
    this.lastCleanup = now;
    const cutoff = new Date(now - this.options.retentionDays * 24 * 60 * 60 * 1000);
    await this.dataSource.getRepository(OutboxEvent).delete({ status: 'published', publishedAt: LessThan(cutoff) });
  }
}
