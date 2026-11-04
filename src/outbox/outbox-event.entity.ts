import { Column, Index, PrimaryGeneratedColumn } from 'typeorm';
import { Entity } from '../database/entities/entity.decorator';
import { GlobalEntity } from '../database/entities/base-entities';
import { DomainEvent } from '../types/events';

export type OutboxStatus = 'pending' | 'published' | 'failed';

/**
 * Events waiting to be sent to Kafka. A row is inserted in the SAME transaction as the change
 * it announces (OutboxService.enqueue), so a change and its event are saved together or not at
 * all; OutboxRelay then publishes the rows in order and marks them as published.
 *
 * One table per service (the naming strategy prefixes it, e.g. bo_outbox_events). It is not
 * multitenant: the tenant travels inside the event.
 *
 * Add it to the entities of the service: `entities: [..., ...OUTBOX_ENTITIES]`.
 */
@Entity('outbox_events')
@Index(['status', 'id'])
export class OutboxEvent extends GlobalEntity {
  /** Monotonic: defines the publishing order */
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id!: string;

  @Column({ name: 'event_id', type: 'uuid' })
  eventId!: string;

  @Column({ name: 'event_type', type: 'varchar', length: 100 })
  eventType!: string;

  @Column({ name: 'aggregate_id', type: 'varchar', length: 100 })
  aggregateId!: string;

  /** Kafka partition key: events with the same key keep their order */
  @Column({ name: 'partition_key', type: 'varchar', length: 255 })
  partitionKey!: string;

  @Column({ type: 'jsonb' })
  payload!: DomainEvent;

  @Column({ type: 'varchar', length: 20, default: 'pending' })
  status!: OutboxStatus;

  @Column({ type: 'integer', default: 0 })
  attempts!: number;

  @Column({ name: 'last_error', type: 'text', nullable: true })
  lastError!: string | null;

  @Column({ name: 'published_at', type: 'timestamptz', nullable: true })
  publishedAt!: Date | null;
}

export const OUTBOX_ENTITIES = [OutboxEvent];
