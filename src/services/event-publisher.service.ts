import { Injectable, OnModuleDestroy, Logger } from '@nestjs/common';
import { ClientProxy, ClientProxyFactory, Transport } from '@nestjs/microservices';
import { DomainEvent, DomainEventType } from '../types/events';
import { SharedConfigService } from '../config/env.config';
import { randomUUID } from 'crypto';

/**
 * Event Publisher Service - Redis Transport (Fire-and-Forget)
 *
 * Publishes domain events using NestJS Microservices with Redis transport.
 * Replaces AWS SNS/SQS in the Railway + Supabase stack.
 *
 * Key Features:
 * - Fire-and-forget: Events are emitted without waiting for confirmation
 * - Redis pub/sub for event distribution
 * - Automatic connection management
 * - Retry logic for failed connections
 * - No blocking on event emission
 *
 * @example
 * ```typescript
 * @Injectable()
 * export class SubdomainRepository extends BaseRepository {
 *   constructor(eventPublisher: EventPublisher) {
 *     super(adapter, eventPublisher, {
 *       events: {
 *         publishOnCreate: true,
 *       },
 *     });
 *   }
 * }
 * ```
 */
@Injectable()
export class EventPublisher implements OnModuleDestroy {
  private client: ClientProxy;
  private readonly logger = new Logger(EventPublisher.name);
  private isConnected = false;

  constructor(private config: SharedConfigService) {
    const redisConfig = this.config.redis;

    this.client = ClientProxyFactory.create({
      transport: Transport.REDIS,
      options: {
        host: redisConfig.host,
        port: redisConfig.port,
        ...(redisConfig.password && { password: redisConfig.password }),
        retryAttempts: 5,
        retryDelay: 3000,
      },
    });

    // Connect on initialization
    this.connect();

    this.logger.log(
      `EventPublisher initialized with Redis at ${redisConfig.host}:${redisConfig.port}`
    );
  }

  /**
   * Connect to Redis
   * Called automatically on module initialization
   */
  private async connect(): Promise<void> {
    try {
      await this.client.connect();
      this.isConnected = true;
      this.logger.log('EventPublisher connected to Redis successfully');
    } catch (error: any) {
      this.isConnected = false;
      this.logger.error(`Failed to connect to Redis: ${error.message}`);
      // Don't throw - allow service to start even if Redis is temporarily unavailable
    }
  }

  /**
   * Publish a single domain event (Fire-and-Forget)
   *
   * This method emits the event to Redis and returns immediately without waiting for confirmation.
   * If emission fails, it logs the error but does NOT throw to avoid blocking the caller.
   *
   * @param event - Domain event to publish
   */
  async publishEvent(event: DomainEvent): Promise<void> {
    try {
      // Ensure event has required fields
      const completeEvent = {
        ...event,
        eventId: event.eventId || randomUUID(),
        timestamp: event.timestamp || new Date(),
      };

      // Emit event (fire-and-forget - no .toPromise())
      this.client.emit(event.eventType, completeEvent);

      this.logger.debug(`Event emitted: ${event.eventType} (${completeEvent.eventId})`);
    } catch (error: any) {
      // Log error but do NOT throw - fire-and-forget semantics
      this.logger.error(
        `Failed to emit event ${event.eventType}: ${error.message}`,
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
      this.logger.error(`Failed to emit event batch: ${error.message}`, error.stack);
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
        source: this.config.get('SERVICE_NAME') || 'backend-service',
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
      this.logger.log('EventPublisher disconnected from Redis');
    } catch (error: any) {
      this.logger.error(`Error closing Redis connection: ${error.message}`);
    }
  }
}
