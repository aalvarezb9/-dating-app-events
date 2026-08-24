import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ClientProxy, ClientProxyFactory, Transport } from '@nestjs/microservices';
import { DomainEvent, DomainEventType } from '../types/events';
import { SharedConfigService } from '../config/env.config';
import { randomUUID } from 'crypto';
import { lastValueFrom } from 'rxjs';

/**
 * Event Publisher Service - Kafka Transport (Fire-and-Forget)
 *
 * Publishes domain events using NestJS Microservices with Kafka transport.
 * Uses partition keys to guarantee ordering of events for the same entity.
 *
 * Key Features:
 * - Fire-and-forget: Events are emitted without waiting for confirmation
 * - Partition keys: Events with same key go to same partition (ordering guaranteed)
 * - Auto-create topics (no manual registration required)
 * - Consumer groups for horizontal scaling
 *
 * Partition Strategy:
 * - Key = aggregateId (tenantId, userId, etc.)
 * - All events for same tenant/user → same partition → ordered processing
 *
 * @example
 * ```typescript
 * @Injectable()
 * export class SubdomainRepository extends BaseRepository {
 *   constructor(eventPublisher: EventPublisher) {
 *     super(adapter, eventPublisher, {
 *       events: {
 *         publishOnCreate: true,
 *         eventKeyExtractor: (entity) => entity.tenantId,
 *       },
 *     });
 *   }
 * }
 * ```
 */
@Injectable()
export class EventPublisher implements OnModuleInit, OnModuleDestroy {
  private client: ClientProxy;
  private readonly logger = new Logger(EventPublisher.name);
  private isConnected = false;
  private connectionPromise: Promise<void> | null = null;

  constructor(private config: SharedConfigService) {
    const kafkaConfig = this.config.kafka;

    this.client = ClientProxyFactory.create({
      transport: Transport.KAFKA,
      options: {
        client: {
          clientId: kafkaConfig.clientId,
          brokers: kafkaConfig.brokers,
          retry: {
            retries: 5,
            initialRetryTime: 300,
            maxRetryTime: 30000,
          },
        },
        producer: {
          allowAutoTopicCreation: true,
          idempotent: true,
          maxInFlightRequests: 5,
          retry: {
            retries: 5,
            initialRetryTime: 300,
          },
        },
      },
    }) as unknown as ClientProxy;

    this.logger.log(
      `EventPublisher initialized with Kafka brokers: ${kafkaConfig.brokers.join(', ')} (clientId: ${kafkaConfig.clientId})`
    );
  }

  /**
   * OnModuleInit lifecycle hook
   * Ensures Kafka connection is established before the module is ready
   */
  async onModuleInit() {
    await this.connect();
  }

  /**
   * Connect to Kafka
   * Called automatically on module initialization
   */
  private async connect(): Promise<void> {
    if (this.connectionPromise) {
      return this.connectionPromise;
    }

    this.connectionPromise = (async () => {
      try {
        await this.client.connect();
        this.isConnected = true;
        this.logger.log('EventPublisher connected to Kafka successfully');
      } catch (error: any) {
        this.isConnected = false;
        this.logger.error(`Failed to connect to Kafka: ${error?.message}`);
        // Don't throw - allow service to start even if Kafka is temporarily unavailable
      }
    })();

    return this.connectionPromise;
  }

  /**
   * Publish a single domain event with partition key (Fire-and-Forget)
   *
   * The partition key ensures that all events for the same entity (aggregateId)
   * go to the same partition, guaranteeing ordered processing.
   *
   * @param event - Domain event to publish
   * @param partitionKey - Optional partition key (defaults to aggregateId)
   */
  async publishEvent(event: DomainEvent, partitionKey?: string): Promise<void> {
    try {
      const completeEvent = {
        ...event,
        eventId: event.eventId || randomUUID(),
        timestamp: event.timestamp || new Date(),
      };

      // Use aggregateId as default partition key (tenant, user, etc.)
      const key = partitionKey || event.aggregateId || event.tenantId || randomUUID();

      // Emit to Kafka with partition key
      // Wrap in try-catch and use lastValueFrom for proper error handling
      try {
        await lastValueFrom(
          this.client.emit(event.eventType, {
            value: completeEvent,
            key: key,
          })
        );

        this.logger.debug(
          `Event emitted to Kafka: ${event.eventType} (id: ${completeEvent.eventId}, key: ${key})`
        );
      } catch (emitError: any) {
        this.logger.error(
          `Failed to emit event to Kafka: ${emitError?.message}`,
          emitError.stack
        );
        // Don't throw - fire-and-forget semantics
      }
    } catch (error: any) {
      this.logger.error(
        `Failed to prepare event ${event.eventType}: ${error?.message}`,
        error.stack
      );
    }
  }

  /**
   * Publish multiple domain events in batch (Fire-and-Forget)
   *
   * @param events - Array of domain events
   */
  async publishEventsBatch(events: DomainEvent[]): Promise<void> {
    if (events.length === 0) {
      return;
    }

    try {
      for (const event of events) {
        await this.publishEvent(event);
      }

      this.logger.debug(`Batch of ${events.length} events emitted`);
    } catch (error: any) {
      this.logger.error(`Failed to emit event batch: ${error?.message}`, error.stack);
    }
  }

  /**
   * Alias for publishEvent (for backward compatibility)
   */
  async publishToTopic(event: DomainEvent): Promise<void> {
    return this.publishEvent(event);
  }

  /**
   * Alias for publishEvent (for backward compatibility)
   */
  async publishEventAndQueue(event: DomainEvent): Promise<void> {
    return this.publishEvent(event);
  }

  /**
   * Create a domain event object with auto-generated fields
   *
   * @param eventType - Type of the event
   * @param aggregateId - ID of the aggregate
   * @param aggregateType - Type of the aggregate
   * @param data - Event data payload
   * @param userId - Optional user ID
   * @param tenantId - Optional tenant ID
   * @returns Complete domain event
   */
  createEvent(
    eventType: DomainEventType,
    aggregateId: string,
    aggregateType: string,
    data: Record<string, any>,
    userId?: string,
    tenantId?: string,
  ): DomainEvent {
    return {
      eventType,
      eventId: randomUUID(),
      aggregateId,
      aggregateType,
      tenantId,
      userId,
      timestamp: new Date(),
      version: 1,
      data,
      metadata: {
        correlationId: randomUUID(),
        source: this.config.get('SERVICE_NAMESPACE') || 'backend-service',
      },
    };
  }

  /**
   * Check if the client is connected to Redis
   */
  isClientConnected(): boolean {
    return this.isConnected;
  }

  /**
   * Cleanup on module destruction
   */
  async onModuleDestroy() {
    try {
      await this.client.close();
      this.isConnected = false;
      this.logger.log('EventPublisher disconnected from Kafka');
    } catch (error: any) {
      this.logger.error(`Error closing Kafka connection: ${error?.message}`);
    }
  }
}
