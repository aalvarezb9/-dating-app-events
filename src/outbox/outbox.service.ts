import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { EntityManager } from 'typeorm';
import { DomainEvent } from '../types/events';
import { OutboxEvent } from './outbox-event.entity';

/**
 * Writes events to the outbox inside the transaction of the change they announce.
 *
 * @example
 * ```typescript
 * await dataSource.transaction(async (manager) => {
 *   const saved = await manager.save(Service, service);
 *   await this.outbox.enqueue(manager, projectionEvent({ ... }));
 * });
 * ```
 *
 * Use the EntityManager of the transaction (never another connection), otherwise the event
 * would not be atomic with the change.
 */
@Injectable()
export class OutboxService {
  async enqueue(manager: EntityManager, event: DomainEvent, partitionKey?: string): Promise<void> {
    const eventId = event.eventId || randomUUID();
    const complete: DomainEvent = { ...event, eventId, timestamp: event.timestamp || new Date() };

    await manager.insert(OutboxEvent, {
      eventId,
      eventType: complete.eventType,
      aggregateId: complete.aggregateId,
      partitionKey: partitionKey || complete.aggregateId || complete.tenantId || eventId,
      payload: complete,
      status: 'pending',
      attempts: 0,
    });
  }

  async enqueueMany(manager: EntityManager, events: Array<{ event: DomainEvent; partitionKey?: string }>): Promise<void> {
    for (const { event, partitionKey } of events) {
      await this.enqueue(manager, event, partitionKey);
    }
  }
}
