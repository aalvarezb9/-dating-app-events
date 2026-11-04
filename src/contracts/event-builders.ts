import { randomUUID } from 'crypto';
import { DomainEvent, DomainEventType } from '../types/events';
import { ProjectionPayload } from './catalog.contracts';

/**
 * Epoch-millisecond version of a row, from its modified_at (TenantEntity / GlobalEntity).
 * Falls back to created_at for rows that were never updated.
 */
export function sourceVersionOf(row: { modifiedAt?: Date | string | null; createdAt?: Date | string | null }): number {
  const value = row.modifiedAt ?? row.createdAt;
  return value ? new Date(value).getTime() : Date.now();
}

/**
 * Event that carries the full state of one row (*_UPSERTED / *_DELETED): the aggregate id is
 * the row id, so every change of one row is ordered inside its Kafka partition.
 *
 * @param source name of the publishing service (SharedConfigService.serviceName)
 */
export function projectionEvent<T extends ProjectionPayload>(params: {
  eventType: DomainEventType;
  aggregateType: string;
  data: T;
  source: string;
  userId?: string;
  schemaVersion?: number;
}): DomainEvent {
  const { eventType, aggregateType, data, source, userId, schemaVersion = 1 } = params;
  return {
    eventId: randomUUID(),
    eventType,
    aggregateId: data.id,
    aggregateType,
    tenantId: data.tenantId,
    userId,
    timestamp: new Date(),
    version: schemaVersion,
    data: data as unknown as Record<string, any>,
    metadata: { source },
  };
}
