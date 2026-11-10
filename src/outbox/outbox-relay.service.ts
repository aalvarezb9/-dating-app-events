import { Inject, Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { DataSource, LessThan } from 'typeorm';
import { EventPublisher } from '../services/event-publisher.service';
import { AdvisoryLockManager } from '../database/advisory-lock-manager';
import { SharedConfigService } from '../config/env.config';
import { kafkaClientConnection } from '../config/connections';
import { OutboxEvent } from './outbox-event.entity';
import { ensureTopicRetention } from './sensitive-topics';

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
  /**
   * Secrets that must not stay in the table: event type -> paths inside the event (e.g.
   * `{ EMAIL_VERIFICATION_REQUESTED: ['data.token'] }`). A published (or parked) event has them replaced
   * by `[redacted]` OUTBOX_REDACT_AFTER_SECONDS after it was written (required when this is used): long
   * enough for a consumer in a hurry, short enough that the table is never a store of credentials.
   * The Kafka topic of those events keeps its messages SENSITIVE_TOPIC_RETENTION_HOURS only (required too):
   * the secret must not outlive that in the broker either (see sensitive-topics.ts).
   */
  redact?: Record<string, string[]>;
}

const DEFAULTS: Required<Omit<OutboxOptions, 'redact'>> = {
  enabled: true,
  pollIntervalMs: 1000,
  batchSize: 50,
  maxAttempts: 10,
  retentionDays: 7,
};

export const OUTBOX_REDACTED = '[redacted]';
const CLEANUP_EVERY_MS = 60 * 60 * 1000;
const REDACT_EVERY_MS = 30 * 1000;

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
  private readonly options: Required<Omit<OutboxOptions, 'redact'>> & Pick<OutboxOptions, 'redact'>;
  private readonly redactAfterMs: number | null = null;
  private readonly topicRetentionHours: number | null = null;
  private topicsProtected = false;
  private lastTopicAttempt = 0;
  private timer?: NodeJS.Timeout;
  private stopped = false;
  private lastCleanup = 0;
  private lastRedaction = 0;

  constructor(
    private readonly dataSource: DataSource,
    private readonly publisher: EventPublisher,
    private readonly config: SharedConfigService,
    @Inject(OUTBOX_OPTIONS) options: OutboxOptions,
  ) {
    this.options = { ...DEFAULTS, ...options };

    if (options.redact && Object.keys(options.redact).length > 0) {
      const seconds = Number(config.get('OUTBOX_REDACT_AFTER_SECONDS'));
      if (!Number.isFinite(seconds) || seconds <= 0) {
        throw new Error('OUTBOX_REDACT_AFTER_SECONDS must be a positive number when the outbox redacts events');
      }
      this.redactAfterMs = seconds * 1000;

      const hours = Number(config.get('SENSITIVE_TOPIC_RETENTION_HOURS'));
      if (!Number.isFinite(hours) || hours <= 0) {
        throw new Error('SENSITIVE_TOPIC_RETENTION_HOURS must be a positive number when the outbox redacts events');
      }
      this.topicRetentionHours = hours;
    }
  }

  onApplicationBootstrap(): void {
    if (this.options.enabled) {
      void this.protectSensitiveTopics(); // not awaited: a broker that is slow to answer must not delay the start
      this.schedule(0);
    }
  }

  /**
   * The topics of the events that carry a secret keep their messages for a short time only. A failure
   * (broker down) is logged and tried again every few minutes: the settings apply to messages already written.
   */
  private async protectSensitiveTopics(): Promise<void> {
    if (!this.options.redact || this.topicRetentionHours === null || this.topicsProtected) {
      return;
    }
    this.lastTopicAttempt = Date.now();
    try {
      const kafka = this.config.kafka;
      await ensureTopicRetention(kafkaClientConnection(kafka), kafka.clientId, Object.keys(this.options.redact), this.topicRetentionHours);
      this.topicsProtected = true;
      this.logger.log(`Topics ${Object.keys(this.options.redact).join(', ')} keep their messages ${this.topicRetentionHours} h`);
    } catch (error: any) {
      this.logger.error(`Could not limit the retention of the topics with secrets (will retry): ${error?.message}`);
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
        await this.redactIfDue();
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

  /**
   * Blank the secrets of the events that were delivered (or parked: they will not be delivered by
   * themselves) a while ago. Pending events keep them: they have not reached their consumer yet.
   * @returns number of fields blanked
   */
  async redactNow(now: number = Date.now()): Promise<number> {
    if (!this.options.redact || this.redactAfterMs === null) {
      return 0;
    }

    const table = this.dataSource.getMetadata(OutboxEvent).tableName;
    const cutoff = new Date(now - this.redactAfterMs);
    let blanked = 0;

    for (const [eventType, paths] of Object.entries(this.options.redact)) {
      for (const path of paths) {
        const keys = path.split('.');
        const [, affected] = await this.dataSource.query(
          `UPDATE "${table}"
              SET payload = jsonb_set(payload, $3::text[], to_jsonb($4::text))
            WHERE event_type = $1
              AND status IN ('published', 'failed')
              AND created_at < $2
              AND payload #>> $3::text[] IS NOT NULL
              AND payload #>> $3::text[] <> $4`,
          [eventType, cutoff, keys, OUTBOX_REDACTED],
        );
        blanked += affected ?? 0;
      }
    }
    return blanked;
  }

  private async redactIfDue(): Promise<void> {
    const now = Date.now();
    if (!this.topicsProtected && now - this.lastTopicAttempt > 5 * 60 * 1000) {
      void this.protectSensitiveTopics();
    }
    if (now - this.lastRedaction < REDACT_EVERY_MS) {
      return;
    }
    this.lastRedaction = now;
    const blanked = await this.redactNow(now);
    if (blanked > 0) {
      this.logger.log(`Redacted ${blanked} secret field(s) of delivered outbox events`);
    }
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
