import { DomainEventType } from '../../types/events';

/**
 * Event filter function type
 * Returns true if event should be published
 */
export type EventFilter<Entity = any> = (entity: Entity, operation: RepositoryOperation) => boolean;

/**
 * Repository operations
 */
export type RepositoryOperation = 'create' | 'update' | 'delete' | 'soft-delete' | 'restore';

/**
 * Configuration for BaseRepository
 */
export interface BaseRepositoryConfig<Entity = any> {
  /**
   * Entity name (for logging and events)
   */
  entityName: string;

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
    eventFilter?: EventFilter<Entity>;

    /**
     * Custom function to extract event data from entity
     */
    eventDataExtractor?: (entity: Entity, operation: RepositoryOperation) => Record<string, any>;

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
