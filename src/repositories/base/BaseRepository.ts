import { Logger } from '@nestjs/common';
import { IDatabaseAdapter, FindCriteria, FindOptions } from './IDatabaseAdapter';
import { BaseRepositoryConfig, RepositoryOperation } from './BaseRepositoryConfig';
import { DomainEvent } from '../../types/events';
import { EventPublisher } from '../../services/event-publisher.service';

/**
 * Base repository class that provides common CRUD operations
 * and automatic event emission for any database type
 *
 * @example PostgreSQL with TypeORM
 * ```typescript
 * class UserRepository extends BaseRepository<User> {
 *   constructor(
 *     postgresAdapter: PostgresAdapter<User>,
 *     eventPublisher: EventPublisher,
 *   ) {
 *     super(postgresAdapter, eventPublisher, {
 *       entityName: 'User',
 *       enableSoftDelete: true,
 *       events: {
 *         publishOnCreate: true,
 *         eventTypeOnCreate: DomainEventType.USER_REGISTERED,
 *         eventFilter: (user, op) => op === 'create' && user.role === 'ADMIN',
 *         eventDataExtractor: (user) => ({
 *           userId: user.id,
 *           email: user.email,
 *         }),
 *       },
 *     });
 *   }
 * }
 * ```
 *
 * @example DynamoDB
 * ```typescript
 * class ProductRepository extends BaseRepository<Product> {
 *   constructor(
 *     dynamoAdapter: DynamoDBAdapter<Product>,
 *     eventPublisher: EventPublisher,
 *   ) {
 *     super(dynamoAdapter, eventPublisher, {
 *       entityName: 'Product',
 *       events: {
 *         publishOnCreate: true,
 *         publishOnUpdate: true,
 *         eventFilter: (product) => product.price > 100, // Only emit events for expensive products
 *       },
 *     });
 *   }
 * }
 * ```
 */
export abstract class BaseRepository<Entity = any> {
  protected readonly logger = new Logger(this.constructor.name);
  protected pendingEvents: DomainEvent[] = [];

  constructor(
    protected readonly adapter: IDatabaseAdapter<Entity>,
    protected readonly eventPublisher: EventPublisher,
    protected readonly config: BaseRepositoryConfig<Entity>,
  ) {
    // Set defaults
    this.config.softDeleteField = this.config.softDeleteField || 'deleted_at';
    this.config.idField = this.config.idField || 'id';
    this.config.tenantIdField = this.config.tenantIdField || 'tenant_id';
    this.config.userIdField = this.config.userIdField || 'user_id';
  }

  /**
   * Create a new entity
   */
  async create(entity: Partial<Entity>): Promise<Entity> {
    try {
      const result = await this.adapter.create(entity);

      await this.handleEventEmission(result, 'create');

      return result;
    } catch (error) {
      this.logger.error(`Error creating ${this.config.entityName}:`, error);
      throw error;
    }
  }

  /**
   * Create multiple entities
   */
  async createMany(entities: Partial<Entity>[]): Promise<Entity[]> {
    try {
      const results = await this.adapter.createMany(entities);

      for (const result of results) {
        await this.handleEventEmission(result, 'create');
      }

      return results;
    } catch (error) {
      this.logger.error(`Error creating multiple ${this.config.entityName}:`, error);
      throw error;
    }
  }

  /**
   * Update an existing entity
   */
  async update(id: string, partialEntity: Partial<Entity>): Promise<Entity> {
    try {
      const result = await this.adapter.update(id, partialEntity);

      await this.handleEventEmission(result, 'update');

      return result;
    } catch (error) {
      this.logger.error(`Error updating ${this.config.entityName} with id ${id}:`, error);
      throw error;
    }
  }

  /**
   * Find one entity by criteria
   */
  async findOne(criteria: FindCriteria): Promise<Entity | null> {
    try {
      return await this.adapter.findOne(criteria);
    } catch (error) {
      this.logger.error(`Error finding one ${this.config.entityName}:`, error);
      throw error;
    }
  }

  /**
   * Find multiple entities
   */
  async findMany(criteria?: FindCriteria, options?: FindOptions): Promise<Entity[]> {
    try {
      return await this.adapter.findMany(criteria || {}, options);
    } catch (error) {
      this.logger.error(`Error finding ${this.config.entityName}:`, error);
      throw error;
    }
  }

  /**
   * Find entity by ID
   */
  async findById(id: string): Promise<Entity | null> {
    try {
      return await this.adapter.findById(id);
    } catch (error) {
      this.logger.error(`Error finding ${this.config.entityName} by id ${id}:`, error);
      throw error;
    }
  }

  /**
   * Delete entity permanently
   */
  async delete(id: string): Promise<void> {
    try {
      const entity = await this.adapter.findById(id);
      if (!entity) {
        throw new Error(`${this.config.entityName} with id ${id} not found`);
      }

      await this.adapter.delete(id);

      await this.handleEventEmission(entity, 'delete');
    } catch (error) {
      this.logger.error(`Error deleting ${this.config.entityName} with id ${id}:`, error);
      throw error;
    }
  }

  /**
   * Soft delete entity (mark as deleted)
   */
  async softDelete(id: string): Promise<void> {
    if (!this.config.enableSoftDelete) {
      throw new Error(`Soft delete is not enabled for ${this.config.entityName}`);
    }

    try {
      const entity = await this.adapter.findById(id);
      if (!entity) {
        throw new Error(`${this.config.entityName} with id ${id} not found`);
      }

      await this.adapter.softDelete(id);

      await this.handleEventEmission(entity, 'soft-delete');
    } catch (error) {
      this.logger.error(`Error soft deleting ${this.config.entityName} with id ${id}:`, error);
      throw error;
    }
  }

  /**
   * Restore soft-deleted entity
   */
  async restore(id: string): Promise<void> {
    if (!this.config.enableSoftDelete) {
      throw new Error(`Soft delete is not enabled for ${this.config.entityName}`);
    }

    try {
      await this.adapter.restore(id);

      const entity = await this.adapter.findById(id);
      if (entity) {
        await this.handleEventEmission(entity, 'restore');
      }
    } catch (error) {
      this.logger.error(`Error restoring ${this.config.entityName} with id ${id}:`, error);
      throw error;
    }
  }

  /**
   * Count entities
   */
  async count(criteria?: FindCriteria): Promise<number> {
    try {
      return await this.adapter.count(criteria);
    } catch (error) {
      this.logger.error(`Error counting ${this.config.entityName}:`, error);
      throw error;
    }
  }

  /**
   * Check if entity exists
   */
  async exists(criteria: FindCriteria): Promise<boolean> {
    try {
      return await this.adapter.exists(criteria);
    } catch (error) {
      this.logger.error(`Error checking existence of ${this.config.entityName}:`, error);
      throw error;
    }
  }

  /**
   * Handle event emission based on operation and configuration
   */
  protected async handleEventEmission(
    entity: Entity,
    operation: RepositoryOperation,
  ): Promise<void> {
    if (!this.config.events) {
      return;
    }

    const { events } = this.config;

    // Check if should publish based on operation
    const shouldPublish = this.shouldPublishEvent(operation);
    if (!shouldPublish) {
      return;
    }

    // Apply custom filter if provided
    if (events.eventFilter && !events.eventFilter(entity, operation)) {
      this.logger.debug(`Event filter rejected ${operation} event for ${this.config.entityName}`);
      return;
    }

    // Get event type for this operation
    const eventType = this.getEventTypeForOperation(operation);
    if (!eventType) {
      this.logger.warn(`No event type configured for ${operation} operation on ${this.config.entityName}`);
      return;
    }

    // Create and publish event
    const event = this.createEventForEntity(entity, eventType, operation);
    this.pendingEvents.push(event);

    try {
      await this.eventPublisher.publishEventAndQueue(event);
      this.logger.debug(`Published ${eventType} event for ${this.config.entityName}`);
    } catch (error) {
      this.logger.error(`Error publishing event for ${this.config.entityName}:`, error);
      // Don't throw - event emission failures shouldn't break CRUD operations
    }
  }

  /**
   * Determine if should publish event for operation
   */
  protected shouldPublishEvent(operation: RepositoryOperation): boolean {
    const { events } = this.config;
    if (!events) return false;

    switch (operation) {
      case 'create':
        return events.publishOnCreate === true;
      case 'update':
        return events.publishOnUpdate === true;
      case 'delete':
        return events.publishOnDelete === true;
      case 'soft-delete':
        return events.publishOnSoftDelete === true;
      case 'restore':
        return events.publishOnRestore === true;
      default:
        return false;
    }
  }

  /**
   * Get event type for operation
   */
  protected getEventTypeForOperation(operation: RepositoryOperation): string | undefined {
    const { events } = this.config;
    if (!events) return undefined;

    switch (operation) {
      case 'create':
        return events.eventTypeOnCreate;
      case 'update':
        return events.eventTypeOnUpdate;
      case 'delete':
        return events.eventTypeOnDelete;
      case 'soft-delete':
        return events.eventTypeOnSoftDelete;
      case 'restore':
        return events.eventTypeOnRestore;
      default:
        return undefined;
    }
  }

  /**
   * Create domain event for entity
   */
  protected createEventForEntity(
    entity: Entity,
    eventType: string,
    operation: RepositoryOperation,
  ): DomainEvent {
    const anyEntity = entity as any;
    const idField = this.config.idField!;
    const aggregateId = anyEntity[idField] || 'unknown';

    let eventData: Record<string, any> = {
      [idField]: aggregateId,
      operation,
    };

    // Use custom extractor if provided
    if (this.config.events?.eventDataExtractor) {
      eventData = {
        ...eventData,
        ...this.config.events.eventDataExtractor(entity, operation),
      };
    }

    return {
      eventType: eventType as any,
      eventId: this.generateId(),
      aggregateId,
      aggregateType: this.config.entityName,
      tenantId: anyEntity[this.config.tenantIdField!] || null,
      userId: anyEntity[this.config.userIdField!] || null,
      timestamp: new Date(),
      version: 1,
      data: eventData,
      metadata: {
        correlationId: this.generateId(),
        source: process.env.SERVICE_NAME || 'unknown-service',
        ...(this.config.events?.eventMetadata || {}),
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
   * Publish all pending events in batch
   */
  async publishPendingEvents(): Promise<void> {
    if (this.pendingEvents.length === 0) {
      return;
    }

    try {
      await this.eventPublisher.publishEventsBatch(this.pendingEvents);
      this.clearPendingEvents();
      this.logger.debug(`Published ${this.pendingEvents.length} pending events`);
    } catch (error) {
      this.logger.error(`Error publishing pending events:`, error);
      throw error;
    }
  }

  /**
   * Generate unique ID
   */
  protected generateId(): string {
    return require('crypto').randomUUID?.() || Math.random().toString(36).substr(2);
  }
}
