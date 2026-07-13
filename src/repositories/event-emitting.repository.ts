import { Logger } from '@nestjs/common';
import { Repository, SaveOptions, RemoveOptions } from 'typeorm';
import { DomainEvent, DomainEventType } from '../types/events';
import { EventPublisher } from '../services/event-publisher.service';

/**
 * Configuration for EventEmittingRepository
 */
export interface EventEmittingRepositoryConfig {
  entityName: string;
  publishOnCreate?: boolean;
  publishOnUpdate?: boolean;
  publishOnDelete?: boolean;
  eventTypeOnCreate?: DomainEventType;
  eventTypeOnUpdate?: DomainEventType;
  eventTypeOnDelete?: DomainEventType;
  eventDataExtractor?: (entity: any) => Record<string, any>;
}

/**
 * Base repository class that extends TypeORM Repository with event emission capabilities
 *
 * Usage:
 * class UserRepository extends EventEmittingRepository<User> {
 *   constructor(
 *     private readonly userRepository: Repository<User>,
 *     private readonly eventPublisher: EventPublisher,
 *   ) {
 *     super(userRepository, eventPublisher, {
 *       entityName: 'User',
 *       publishOnCreate: true,
 *       publishOnDelete: true,
 *       eventTypeOnCreate: DomainEventType.USER_REGISTERED,
 *       eventTypeOnDelete: DomainEventType.USER_DELETED,
 *       eventDataExtractor: (user) => ({
 *         userId: user.id,
 *         email: user.email,
 *         firstName: user.first_name,
 *       })
 *     });
 *   }
 * }
 */
export abstract class EventEmittingRepository<Entity = any> {
  protected readonly logger = new Logger(this.constructor.name);
  protected pendingEvents: DomainEvent[] = [];

  constructor(
    protected readonly repository: Repository<any>,
    protected readonly eventPublisher: EventPublisher,
    protected readonly config: EventEmittingRepositoryConfig,
  ) {}

  /**
   * Save entity and emit event if configured
   */
  async save(
    entity: any,
    options?: SaveOptions,
  ): Promise<any> {
    const entities = Array.isArray(entity) ? entity : [entity];
    const isNewEntity = entities.some((e: any) => !e.id);

    try {
      const result = await this.repository.save(entity, options);

      // Emit events for new entities if configured
      if (isNewEntity && this.config.publishOnCreate) {
        const entitiesToEmit = Array.isArray(result) ? result : [result];
        for (const e of entitiesToEmit) {
          if (!(e as any).id) continue; // Skip if still no ID

          const event = this.createEventForEntity(
            e,
            this.config.eventTypeOnCreate!,
            'create',
          );
          this.pendingEvents.push(event);
          await this.eventPublisher.publishEventAndQueue(event);
        }
      }

      // Emit events for updated entities if configured
      if (!isNewEntity && this.config.publishOnUpdate) {
        const entitiesToEmit = Array.isArray(result) ? result : [result];
        for (const e of entitiesToEmit) {
          const event = this.createEventForEntity(
            e,
            this.config.eventTypeOnUpdate!,
            'update',
          );
          this.pendingEvents.push(event);
          await this.eventPublisher.publishEventAndQueue(event);
        }
      }

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Error saving ${this.config.entityName}: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * Remove entity and emit event if configured
   */
  async remove(
    entity: any,
    options?: RemoveOptions,
  ): Promise<any> {
    if (this.config.publishOnDelete) {
      const entities = Array.isArray(entity) ? entity : [entity];
      for (const e of entities) {
        const event = this.createEventForEntity(
          e,
          this.config.eventTypeOnDelete!,
          'delete',
        );
        this.pendingEvents.push(event);
        await this.eventPublisher.publishEventAndQueue(event);
      }
    }

    return this.repository.remove(entity, options);
  }

  /**
   * Create event for entity based on operation
   */
  protected createEventForEntity(
    entity: Entity,
    eventType: DomainEventType,
    operation: 'create' | 'update' | 'delete',
  ): DomainEvent {
    const anyEntity = entity as any;
    const aggregateId = anyEntity.id || anyEntity.tenant_id || 'unknown';

    let eventData: Record<string, any> = {
      [this.getEntityIdFieldName(anyEntity)]: aggregateId,
    };

    // Use custom extractor if provided
    if (this.config.eventDataExtractor) {
      eventData = {
        ...eventData,
        ...this.config.eventDataExtractor(entity),
      };
    }

    return {
      eventType,
      eventId: this.generateId(),
      aggregateId,
      aggregateType: this.config.entityName,
      tenantId: anyEntity.tenant_id || anyEntity.tenantId,
      userId: anyEntity.user_id || anyEntity.userId,
      timestamp: new Date(),
      version: 1,
      data: eventData,
      metadata: {
        correlationId: this.generateId(),
        source: process.env.SERVICE_NAME || 'unknown-service',
      },
    };
  }

  /**
   * Get pending events that haven't been published
   */
  getPendingEvents(): DomainEvent[] {
    return [...this.pendingEvents];
  }

  /**
   * Clear pending events after they're published
   */
  clearPendingEvents(): void {
    this.pendingEvents = [];
  }

  /**
   * Publish all pending events
   */
  async publishPendingEvents(): Promise<void> {
    if (this.pendingEvents.length === 0) {
      return;
    }

    try {
      await this.eventPublisher.publishEventsBatch(this.pendingEvents);
      this.clearPendingEvents();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Error publishing pending events: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * Get ID field name from entity (handles both id and tenant_id)
   */
  protected getEntityIdFieldName(entity: any): string {
    if (entity.id) return 'id';
    if (entity.tenant_id) return 'tenant_id';
    if (entity.tenantId) return 'tenantId';
    return 'id'; // default
  }

  /**
   * Generate unique ID
   */
  protected generateId(): string {
    return require('crypto').randomUUID?.() || Math.random().toString(36).substr(2);
  }

  /**
   * Delegate common repository methods
   */
  find(options?: any) {
    return this.repository.find(options);
  }

  findOne(options: any) {
    return this.repository.findOne(options);
  }

  findBy(where: any) {
    return this.repository.findBy(where);
  }

  findOneBy(where: any) {
    return this.repository.findOneBy(where);
  }

  count(options?: any) {
    return this.repository.count(options);
  }

  update(criteria: any, partialEntity: any) {
    return this.repository.update(criteria, partialEntity);
  }

  delete(criteria: any) {
    return this.repository.delete(criteria);
  }

  createQueryBuilder(alias?: string) {
    return this.repository.createQueryBuilder(alias);
  }
}
