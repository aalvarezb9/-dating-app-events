import { Logger } from '@nestjs/common';
import { IDatabaseAdapter, FindCriteria, FindOptions } from './IDatabaseAdapter';
import { BaseRepositoryConfig, RepositoryOperation } from './BaseRepositoryConfig';
import { DomainEvent, DomainEventType } from '../../types/events';
import { EventPublisher } from '../../services/event-publisher.service';
import { ExecutionContext } from '../../common/context/execution-context.service';
import { randomUUID } from 'crypto';
import { PaginationQuery, PaginatedResult, createPaginatedResult } from '../../common/dto/pagination.dto';
import { DynamicFilters, FilterOperator } from '../../common/dto/filterable-query.dto';
import { Between, MoreThanOrEqual, LessThanOrEqual, In, Not, Like, ILike } from 'typeorm';

/**
 * Base repository class with DDD support and automatic tenant isolation
 *
 * Features:
 * - Dual entity support (DB entity + Domain entity)
 * - Automatic tenant filtering on ALL operations (with optional bypass)
 * - Domain event emission
 * - Soft delete support
 * - Entity mapping (DB ↔ Domain)
 * - Separated save() and update() methods for clarity
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
 *
 *   // Creating a new subdomain
 *   async createSubdomain(domain: Subdomain): Promise<Subdomain> {
 *     return await this.save(domain); // Use save() for CREATE
 *   }
 *
 *   // Updating an existing subdomain
 *   async updateSubdomain(id: string, domain: Subdomain): Promise<Subdomain> {
 *     return await this.update(id, domain); // Use update() for UPDATE
 *   }
 *
 *   // Cross-tenant operation example
 *   async isSubdomainNameAvailable(subdomain: string): Promise<boolean> {
 *     // Bypass tenant filter for cross-tenant availability check
 *     const exists = await super.exists({ subdomain }, true);
 *     return !exists;
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
   *
   * NOTE: This is optional if you're using ExecutionContextInterceptor,
   * which automatically captures tenantId from the request.
   */
  setTenantId(tenantId: string): void {
    this.tenantId = tenantId;
  }

  /**
   * Get current tenant ID
   *
   * Tries to get tenantId in this order:
   * 1. From ExecutionContext (set by ExecutionContextInterceptor)
   * 2. From manually set tenantId (via setTenantId())
   *
   * @throws Error if no tenant ID is available
   */
  getTenantId(): string {
    // Try ExecutionContext first (recommended approach)
    const contextTenantId = ExecutionContext.getTenantId();
    if (contextTenantId) {
      return contextTenantId;
    }

    // Fallback to manually set tenantId
    if (this.tenantId) {
      return this.tenantId;
    }

    throw new Error(
      'Tenant ID not available. Either use ExecutionContextInterceptor globally, or call setTenantId() before performing operations.',
    );
  }

  /**
   * Add tenant filter to criteria
   * @param criteria - Search criteria
   * @param bypassTenantFilter - If true, skips tenant filtering (for cross-tenant operations)
   */
  private addTenantFilter(criteria: FindCriteria = {}, bypassTenantFilter = false): FindCriteria {
    if (bypassTenantFilter) {
      return criteria;
    }

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
   * Save entity (create only)
   * Use this method when creating a new entity from a domain entity
   * Automatically adds tenant ID
   *
   * NOTE: This method is for CREATE operations only.
   * For updates, use the update() method instead.
   */
  async save(entity: DomainEntity, bypassTenantFilter = false): Promise<DomainEntity> {
    try {
      const dbEntity = this.toDb(entity);
      const tenantField = this.config.tenantIdField!;

      // Ensure tenant ID is set
      let entityWithTenant = {
        ...dbEntity
      } as Partial<DbEntity>;
      if (!bypassTenantFilter) entityWithTenant = {...entityWithTenant, [tenantField]: this.getTenantId()};

      const result = await this.adapter.create(entityWithTenant);
      await this.handleEventEmission(result, 'create');

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
   * @param id - Entity ID
   * @param bypassTenantFilter - If true, skips tenant filtering (for cross-tenant operations)
   */
  async findById(id: string, bypassTenantFilter = false): Promise<DomainEntity | null> {
    try {
      const criteria = this.addTenantFilter({ [this.config.idField!]: id } as any, bypassTenantFilter);
      const result = await this.adapter.findOne(criteria);
      return result ? this.toDomain(result) : null;
    } catch (error) {
      this.logger.error(`Error finding ${this.config.entityName} by id ${id}:`, error);
      throw error;
    }
  }

  /**
   * Find one by criteria
   * @param criteria - Search criteria
   * @param bypassTenantFilter - If true, skips tenant filtering (for cross-tenant operations)
   */
  async findOne(criteria: FindCriteria = {}, bypassTenantFilter = false): Promise<DomainEntity | null> {
    try {
      const filteredCriteria = this.addTenantFilter(criteria, bypassTenantFilter);
      const result = await this.adapter.findOne(filteredCriteria);
      return result ? this.toDomain(result) : null;
    } catch (error) {
      this.logger.error(`Error finding ${this.config.entityName}:`, error);
      throw error;
    }
  }

  /**
   * Find many by criteria
   * @param criteria - Search criteria
   * @param options - Query options (limit, offset, order)
   * @param bypassTenantFilter - If true, skips tenant filtering (for cross-tenant operations)
   */
  async findMany(
    criteria: FindCriteria = {},
    options?: FindOptions,
    bypassTenantFilter = false,
  ): Promise<DomainEntity[]> {
    try {
      const filteredCriteria = this.addTenantFilter(criteria, bypassTenantFilter);
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
   * Update entity by ID (update only)
   * Use this method when updating an existing entity
   * Automatically filters by tenant to ensure tenant isolation
   *
   * NOTE: This method is for UPDATE operations only.
   * For creating new entities, use the save() or create() method instead.
   *
   * @param id - Entity ID to update
   * @param partialEntity - Partial entity data to update (can be Partial<DbEntity> or DomainEntity)
   * @throws Error if entity not found for this tenant
   */
  async update(id: string, partialEntity: Partial<DbEntity> | DomainEntity): Promise<DomainEntity> {
    try {
      // Verify entity belongs to tenant
      const existing = await this.findById(id);
      if (!existing) {
        throw new Error(`${this.config.entityName} with id ${id} not found for this tenant`);
      }

      // If partialEntity is a domain entity, convert it to DB entity
      let dbPartialEntity: Partial<DbEntity>;
      if (this.isDomainEntity(partialEntity)) {
        dbPartialEntity = this.toDb(partialEntity as DomainEntity);
      } else {
        dbPartialEntity = partialEntity as Partial<DbEntity>;
      }

      const result = await this.adapter.update(id, dbPartialEntity);
      await this.handleEventEmission(result, 'update');

      return this.toDomain(result);
    } catch (error) {
      this.logger.error(`Error updating ${this.config.entityName} with id ${id}:`, error);
      throw error;
    }
  }

  /**
   * Helper to determine if an entity is a domain entity
   * This is a simple heuristic - override in subclasses if needed
   */
  private isDomainEntity(entity: any): boolean {
    // If mappers are configured, assume it could be a domain entity
    // Check if it has methods (domain entities typically have methods)
    return this.config.mappers !== undefined && typeof entity === 'object' && entity !== null;
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
   * @param criteria - Search criteria
   * @param bypassTenantFilter - If true, skips tenant filtering (for cross-tenant operations)
   */
  async exists(criteria: FindCriteria, bypassTenantFilter = false): Promise<boolean> {
    try {
      const filteredCriteria = this.addTenantFilter(criteria, bypassTenantFilter);
      return await this.adapter.exists(filteredCriteria);
    } catch (error) {
      this.logger.error(`Error checking existence of ${this.config.entityName}:`, error);
      throw error;
    }
  }

  /**
   * Count entities
   * @param criteria - Search criteria
   * @param bypassTenantFilter - If true, skips tenant filtering (for cross-tenant operations)
   */
  async count(criteria: FindCriteria = {}, bypassTenantFilter = false): Promise<number> {
    try {
      const filteredCriteria = this.addTenantFilter(criteria, bypassTenantFilter);
      return await this.adapter.count(filteredCriteria);
    } catch (error) {
      this.logger.error(`Error counting ${this.config.entityName}:`, error);
      throw error;
    }
  }

  /**
   * Convert dynamic filters to TypeORM find conditions
   *
   * Supports operators:
   * - $eq: Equal
   * - $ne: Not equal
   * - $gt: Greater than
   * - $gte: Greater than or equal
   * - $lt: Less than
   * - $lte: Less than or equal
   * - $between: Between two values
   * - $in: In array
   * - $notIn: Not in array
   * - $like: Like pattern
   * - $ilike: Case-insensitive like
   */
  protected buildTypeOrmConditions(filters: DynamicFilters): FindCriteria {
    const conditions: FindCriteria = {};

    for (const [field, value] of Object.entries(filters)) {
      // Skip undefined values
      if (value === undefined) {
        continue;
      }

      // Direct value (equality)
      if (typeof value !== 'object' || value === null || value instanceof Date) {
        conditions[field] = value;
        continue;
      }

      // Handle operators
      const filterObj = value as FilterOperator;

      if ('$eq' in filterObj) {
        conditions[field] = filterObj.$eq;
      } else if ('$ne' in filterObj) {
        conditions[field] = Not(filterObj.$ne);
      } else if ('$gt' in filterObj) {
        conditions[field] = MoreThanOrEqual(filterObj.$gt);
      } else if ('$gte' in filterObj) {
        conditions[field] = MoreThanOrEqual(filterObj.$gte);
      } else if ('$lt' in filterObj) {
        conditions[field] = LessThanOrEqual(filterObj.$lt);
      } else if ('$lte' in filterObj) {
        conditions[field] = LessThanOrEqual(filterObj.$lte);
      } else if ('$between' in filterObj) {
        const [start, end] = filterObj.$between;
        conditions[field] = Between(start, end);
      } else if ('$in' in filterObj) {
        conditions[field] = In(filterObj.$in);
      } else if ('$notIn' in filterObj) {
        conditions[field] = Not(In(filterObj.$notIn));
      } else if ('$like' in filterObj) {
        conditions[field] = Like(filterObj.$like);
      } else if ('$ilike' in filterObj) {
        conditions[field] = ILike(filterObj.$ilike);
      }
    }

    return conditions;
  }

  /**
   * Find many with pagination and dynamic filters
   *
   * This method handles:
   * - Automatic tenant filtering
   * - Dynamic filters with operators ($gte, $between, etc.)
   * - Sorting
   * - Pagination
   * - Total count
   *
   * @example
   * ```typescript
   * const result = await repository.findManyWithPagination(
   *   {
   *     rating: { $gte: 4 },           // rating >= 4
   *     status: 'COMPLETED',           // status = 'COMPLETED'
   *     createdAt: { $between: [start, end] }  // createdAt BETWEEN start AND end
   *   },
   *   {
   *     page: 1,
   *     limit: 10,
   *     sortBy: 'createdAt',
   *     sortOrder: 'DESC'
   *   }
   * );
   * // Returns: { data: [...], meta: { page, limit, total, ... } }
   * ```
   *
   * @param filters - Dynamic filters (supports operators)
   * @param pagination - Pagination and sorting options
   * @param bypassTenantFilter - Skip tenant filtering for cross-tenant queries
   * @returns Paginated result with data and metadata
   */
  async findManyWithPagination(
    filters: DynamicFilters = {},
    pagination: PaginationQuery = {},
    bypassTenantFilter = false,
  ): Promise<PaginatedResult<DomainEntity>> {
    try {
      const { page = 1, limit = 10, sortBy, sortOrder = 'DESC' } = pagination;
      const skip = (page - 1) * limit;

      // Build TypeORM conditions from dynamic filters
      const conditions = this.buildTypeOrmConditions(filters);

      // Add tenant filter
      const filteredConditions = this.addTenantFilter(conditions, bypassTenantFilter);

      // Build order clause
      const order: any = sortBy ? { [sortBy]: sortOrder } : undefined;

      // Access the underlying TypeORM repository
      const repository = (this.adapter as any).repository;

      if (!repository || !repository.findAndCount) {
        throw new Error('Pagination requires TypeORM repository adapter');
      }

      // Execute query with pagination
      const [data, total] = await repository.findAndCount({
        where: filteredConditions,
        take: limit,
        skip,
        order,
      });

      // Map to domain entities
      const domainData = data.map((item: DbEntity) => this.toDomain(item));

      // Return paginated result
      return createPaginatedResult(domainData, total, { page, limit } as any);
    } catch (error) {
      this.logger.error(`Error in findManyWithPagination for ${this.config.entityName}:`, error);
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
