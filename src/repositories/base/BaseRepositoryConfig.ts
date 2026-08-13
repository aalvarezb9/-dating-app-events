import { DomainEventType } from '../../types/events';

/**
 * Event filter function type
 * Returns true if event should be published
 */
export type EventFilter<DbEntity = any> = (entity: DbEntity, operation: RepositoryOperation) => boolean;

/**
 * Repository operations
 */
export type RepositoryOperation = 'create' | 'update' | 'delete' | 'soft-delete' | 'restore';

/**
 * Mapper functions for converting between DB and Domain entities
 */
export interface EntityMappers<DbEntity, DomainEntity> {
  /**
   * Convert domain entity to database entity
   */
  toDbEntity: (domainEntity: DomainEntity) => Partial<DbEntity>;

  /**
   * Convert database entity to domain entity
   */
  toDomainEntity: (dbEntity: DbEntity) => DomainEntity;
}

/**
 * Configuration for BaseRepository
 */
export interface BaseRepositoryConfig<DbEntity = any, DomainEntity = any> {
  /**
   * Entity name (for logging and events)
   */
  entityName: string;

  /**
   * Mapper functions to convert between DB and Domain entities
   * If not provided, DB entities will be returned as-is
   */
  mappers?: EntityMappers<DbEntity, DomainEntity>;

  /**
   * Enable soft delete support
   */
  enableSoftDelete?: boolean;

  /**
   * Field name used for soft delete timestamp
   * @default 'deleted_at'
   */
  softDeleteField?: string;

  /**
   * Event publishing configuration
   */
  events?: {
    /**
     * Publish event on create
     */
    publishOnCreate?: boolean;

    /**
     * Publish event on update
     */
    publishOnUpdate?: boolean;

    /**
     * Publish event on delete
     */
    publishOnDelete?: boolean;

    /**
     * Publish event on soft delete
     */
    publishOnSoftDelete?: boolean;

    /**
     * Publish event on restore
     */
    publishOnRestore?: boolean;

    /**
     * Event type for create operation
     */
    eventTypeOnCreate?: DomainEventType;

    /**
     * Event type for update operation
     */
    eventTypeOnUpdate?: DomainEventType;

    /**
     * Event type for delete operation
     */
    eventTypeOnDelete?: DomainEventType;

    /**
     * Event type for soft delete operation
     */
    eventTypeOnSoftDelete?: DomainEventType;

    /**
     * Event type for restore operation
     */
    eventTypeOnRestore?: DomainEventType;

    /**
     * Filter function to determine if event should be published
     * @example
     * eventFilter: (user, operation) => operation === 'create' && user.email.endsWith('@admin.com')
     */
    eventFilter?: EventFilter<DbEntity>;

    /**
     * Custom function to extract event data from entity
     */
    eventDataExtractor?: (entity: DbEntity, operation: RepositoryOperation) => Record<string, any>;

    /**
     * Additional metadata to include in events
     */
    eventMetadata?: Record<string, any>;
  };

  /**
   * Custom ID field name
   * @default 'id'
   */
  idField?: string;

  /**
   * Tenant ID field name (for multi-tenancy)
   * @default 'tenant_id'
   */
  tenantIdField?: string;

  /**
   * User ID field name (for audit trail)
   * @default 'user_id'
   */
  userIdField?: string;
}
