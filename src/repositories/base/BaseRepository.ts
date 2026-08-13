import { Logger } from '@nestjs/common';
import { IDatabaseAdapter, FindCriteria, FindOptions } from './IDatabaseAdapter';
import { BaseRepositoryConfig, RepositoryOperation } from './BaseRepositoryConfig';
import { DomainEvent, DomainEventType } from '../../types/events';
import { EventPublisher } from '../../services/event-publisher.service';
import { randomUUID } from 'crypto';

/**
 * Base repository class with DDD support and automatic tenant isolation
 *
 * Features:
 * - Dual entity support (DB entity + Domain entity)
 * - Automatic tenant filtering on ALL operations
 * - Domain event emission
 * - Soft delete support
 * - Entity mapping (DB ↔ Domain)
 *
 * @template DbEntity - Database entity type (TypeORM, Prisma, etc.)
 * @template DomainEntity - Domain entity type (DDD entities)
 *
 * @example With DDD Mapping
 * ```typescript
 * export class SubdomainRepository extends BaseRepository<BusinessSubdomain, Subdomain> {
 *   constructor(
 *     @InjectRepository(BusinessSubdomain) repo: Repository<BusinessSubdomain>,
 *     eventPublisher: EventPublisher,
 *   ) {
 *     super(new PostgresAdapter(repo), eventPublisher, {
 *       entityName: 'Subdomain',
 *       idField: 'id',
 *       tenantIdField: 'tenantId',
 *       mappers: {
 *         toDbEntity: (domain) => ({
 *           id: domain.getId(),
 *           tenantId: domain.getTenantId(),
 *           subdomain: domain.getSubdomainName().value,
 *         }),
 *         toDomainEntity: (db) => Subdomain.reconstitute(db.id, db.tenantId, ...)
 *       },
 *       events: { ... }
 *     });
 *   }
 * }
 * ```
 */
export class BaseRepository<DbEntity = any, DomainEntity = DbEntity> {
  protected readonly logger = new Logger(this.constructor.name);
  protected pendingEvents: DomainEvent[] = [];
  protected tenantId: string | null = null;

  constructor(
    protected readonly adapter: IDatabaseAdapter<DbEntity>,
    protected readonly eventPublisher: EventPublisher,
    protected readonly config: BaseRepositoryConfig<DbEntity, DomainEntity>,
  ) {
    // Set defaults
    this.config.softDeleteField = this.config.softDeleteField || 'deleted_at';
    this.config.idField = this.config.idField || 'id';
    this.config.tenantIdField = this.config.tenantIdField || 'tenantId';
    this.config.userIdField = this.config.userIdField || 'user_id';
  }

  /**
   * Set tenant context for automatic filtering
   * MUST be called before any CRUD operation
   */
  setTenantId(tenantId: string): void {
    this.tenantId = tenantId;
  }

  /**
   * Get current tenant ID
   */
  getTenantId(): string {
    if (!this.tenantId) {
      throw new Error('Tenant ID not set. Call setTenantId() before performing operations.');
    }
    return this.tenantId;
  }

  /**
   * Add tenant filter to criteria
   */
  private addTenantFilter(criteria: FindCriteria = {}): FindCriteria {
    const tenantField = this.config.tenantIdField!;
    return {
      ...criteria,
      [tenantField]: this.getTenantId(),
    };
  }

  /**
   * Map DB entity to Domain entity (if mappers configured)
   */
  protected toDomain(dbEntity: DbEntity): DomainEntity {
    if (this.config.mappers) {
      return this.config.mappers.toDomainEntity(dbEntity);
    }
    return dbEntity as unknown as DomainEntity;
  }

  /**
   * Map Domain entity to DB entity (if mappers configured)
   */
  protected toDb(domainEntity: DomainEntity): Partial<DbEntity> {
    if (this.config.mappers) {
      return this.config.mappers.toDbEntity(domainEntity);
    }
    return domainEntity as unknown as Partial<DbEntity>;
  }

  /**
   * Save entity (create or update)
   * Automatically filters by tenant
   */
  async save(entity: DomainEntity): Promise<DomainEntity> {
    try {
      const dbEntity = this.toDb(entity);
      const idField = this.config.idField!;
      const entityId = (dbEntity as any)[idField];

      if (!entityId) {
        throw new Error(`Entity must have ${idField} field to save`);
      }

      // Add tenant filter
      const criteria = this.addTenantFilter({ [idField]: entityId } as any);
      const existing = await this.adapter.findOne(criteria);

      let result: DbEntity;
      if (existing) {
        result = await this.adapter.update(entityId, dbEntity);
        await this.handleEventEmission(result, 'update');
      } else {
        result = await this.adapter.create(dbEntity);
        await this.handleEventEmission(result, 'create');
      }

      return this.toDomain(result);
    } catch (error) {
      this.logger.error(`Error saving ${this.config.entityName}:`, error);
      throw error;
    }
  }

  /**
   * Create entity
   * Automatically adds tenant ID
   */
  async create(entity: Partial<DbEntity>): Promise<DomainEntity> {
    try {
      const tenantField = this.config.tenantIdField!;
      const entityWithTenant = {
        ...entity,
        [tenantField]: this.getTenantId(),
      } as Partial<DbEntity>;

      const result = await this.adapter.create(entityWithTenant);
      await this.handleEventEmission(result, 'create');

      return this.toDomain(result);
    } catch (error) {
      this.logger.error(`Error creating ${this.config.entityName}:`, error);
      throw error;
    }
  }

  /**
   * Find by ID
   * Automatically filters by tenant
   */
  async findById(id: string): Promise<DomainEntity | null> {
    try {
      const criteria = this.addTenantFilter({ [this.config.idField!]: id } as any);
      const result = await this.adapter.findOne(criteria);
      return result ? this.toDomain(result) : null;
    } catch (error) {
      this.logger.error(`Error finding ${this.config.entityName} by id ${id}:`, error);
      throw error;
    }
  }

  /**
   * Find one by criteria
   * Automatically filters by tenant
   */
  async findOne(criteria: FindCriteria = {}): Promise<DomainEntity | null> {
    try {
      const filteredCriteria = this.addTenantFilter(criteria);
      const result = await this.adapter.findOne(filteredCriteria);
      return result ? this.toDomain(result) : null;
    } catch (error) {
      this.logger.error(`Error finding ${this.config.entityName}:`, error);
      throw error;
    }
  }

  /**
   * Find many by criteria
   * Automatically filters by tenant
   */
  async findMany(
    criteria: FindCriteria = {},
    options?: FindOptions,
  ): Promise<DomainEntity[]> {
    try {
      const filteredCriteria = this.addTenantFilter(criteria);
      const results = await this.adapter.findMany(filteredCriteria, options);
      return results.map((r) => this.toDomain(r));
    } catch (error) {
      this.logger.error(`Error finding many ${this.config.entityName}:`, error);
      throw error;
    }
  }

  /**
   * Find all (for current tenant only)
   */
  async findAll(options?: FindOptions): Promise<DomainEntity[]> {
    return this.findMany({}, options);
  }

  /**
   * Update entity by ID
   * Automatically filters by tenant
   */
  async update(id: string, partialEntity: Partial<DbEntity>): Promise<DomainEntity> {
    try {
      // Verify entity belongs to tenant
      const existing = await this.findById(id);
      if (!existing) {
        throw new Error(`${this.config.entityName} with id ${id} not found for this tenant`);
      }

      const result = await this.adapter.update(id, partialEntity);
      await this.handleEventEmission(result, 'update');

      return this.toDomain(result);
    } catch (error) {
      this.logger.error(`Error updating ${this.config.entityName} with id ${id}:`, error);
      throw error;
    }
  }

  /**
   * Delete entity by ID
   * Automatically filters by tenant
   */
  async delete(id: string | DomainEntity): Promise<void> {
    try {
      let entityId: string;

      if (typeof id === 'string') {
        entityId = id;
      } else {
        const dbEntity = this.toDb(id);
        entityId = (dbEntity as any)[this.config.idField!];
      }

      // Verify entity belongs to tenant before deleting
      const existing = await this.findById(entityId);
      if (!existing) {
        throw new Error(`${this.config.entityName} with id ${entityId} not found for this tenant`);
      }

      await this.adapter.delete(entityId);
      await this.handleEventEmission(this.toDb(existing) as DbEntity, 'delete');
    } catch (error) {
      this.logger.error(`Error deleting ${this.config.entityName}:`, error);
      throw error;
    }
  }

  /**
   * Soft delete entity
   * Automatically filters by tenant
   */
  async softDelete(id: string): Promise<void> {
    if (!this.config.enableSoftDelete) {
      throw new Error(`Soft delete is not enabled for ${this.config.entityName}`);
    }

    try {
      // Verify entity belongs to tenant
      const existing = await this.findById(id);
      if (!existing) {
        throw new Error(`${this.config.entityName} with id ${id} not found for this tenant`);
      }

      await this.adapter.softDelete(id);
      const updated = await this.adapter.findById(id);
      if (updated) {
        await this.handleEventEmission(updated, 'soft-delete');
      }
    } catch (error) {
      this.logger.error(`Error soft deleting ${this.config.entityName} with id ${id}:`, error);
      throw error;
    }
  }

  /**
   * Restore soft-deleted entity
   * Automatically filters by tenant
   */
  async restore(id: string): Promise<void> {
    if (!this.config.enableSoftDelete) {
      throw new Error(`Soft delete is not enabled for ${this.config.entityName}`);
    }

    try {
      await this.adapter.restore(id);
      const restored = await this.adapter.findById(id);
      if (restored) {
        await this.handleEventEmission(restored, 'restore');
      }
    } catch (error) {
      this.logger.error(`Error restoring ${this.config.entityName} with id ${id}:`, error);
      throw error;
    }
  }

  /**
   * Check if entity exists
   * Automatically filters by tenant
   */
  async exists(criteria: FindCriteria): Promise<boolean> {
    try {
      const filteredCriteria = this.addTenantFilter(criteria);
      return await this.adapter.exists(filteredCriteria);
    } catch (error) {
      this.logger.error(`Error checking existence of ${this.config.entityName}:`, error);
      throw error;
    }
  }

  /**
   * Count entities
   * Automatically filters by tenant
   */
  async count(criteria: FindCriteria = {}): Promise<number> {
    try {
      const filteredCriteria = this.addTenantFilter(criteria);
      return await this.adapter.count(filteredCriteria);
    } catch (error) {
      this.logger.error(`Error counting ${this.config.entityName}:`, error);
      throw error;
    }
  }

  /**
   * Handle event emission
   */
  protected async handleEventEmission(
    entity: DbEntity,
    operation: RepositoryOperation,
  ): Promise<void> {
    const eventConfig = this.config.events;
    if (!eventConfig) return;

    // Check if we should publish for this operation
    const shouldPublish =
      (operation === 'create' && eventConfig.publishOnCreate) ||
      (operation === 'update' && eventConfig.publishOnUpdate) ||
      (operation === 'delete' && eventConfig.publishOnDelete) ||
      (operation === 'soft-delete' && eventConfig.publishOnSoftDelete) ||
      (operation === 'restore' && eventConfig.publishOnRestore);

    if (!shouldPublish) return;

    // Apply custom filter if exists
    if (eventConfig.eventFilter && !eventConfig.eventFilter(entity, operation)) {
      return;
    }

    // Determine event type
    let eventType: string | undefined;
    switch (operation) {
      case 'create':
        eventType = eventConfig.eventTypeOnCreate;
        break;
      case 'update':
        eventType = eventConfig.eventTypeOnUpdate;
        break;
      case 'delete':
        eventType = eventConfig.eventTypeOnDelete;
        break;
      case 'soft-delete':
        eventType = eventConfig.eventTypeOnSoftDelete;
        break;
      case 'restore':
        eventType = eventConfig.eventTypeOnRestore;
        break;
    }

    if (!eventType) return;

    // Extract event data
    const eventData = eventConfig.eventDataExtractor
      ? eventConfig.eventDataExtractor(entity, operation)
      : { entityId: (entity as any)[this.config.idField!] };

    // Create domain event
    const event: DomainEvent = {
      eventType: eventType as DomainEventType,
      eventId: randomUUID(),
      aggregateId: (entity as any)[this.config.idField!],
      aggregateType: this.config.entityName,
      tenantId: this.tenantId || undefined,
      timestamp: new Date(),
      version: 1,
      data: eventData,
      metadata: eventConfig.eventMetadata,
    };

    // Publish event
    try {
      await this.eventPublisher.publishEvent(event);
      this.logger.debug(`Event published: ${eventType} for ${this.config.entityName}`);
    } catch (error) {
      this.logger.error(`Failed to publish event for ${this.config.entityName}:`, error);
      // Don't throw - event publishing failures shouldn't break CRUD operations
    }
  }
}
