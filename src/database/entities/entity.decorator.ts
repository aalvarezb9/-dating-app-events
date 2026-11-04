import { Entity as TypeOrmEntity, EntityOptions, Index, IndexOptions } from 'typeorm';
import { getEntityScope } from './entity-scope';

/**
 * Entity decorator for every service. Same as TypeORM's @Entity, plus a guard: the class must
 * extend TenantEntity (multitenant table) or GlobalEntity, so nobody forgets to declare the
 * isolation of a table. The application fails at startup (import time) if it does not.
 *
 * The table name is the logical name; the service prefix (SERVICE_NAMESPACE) is added by
 * ServiceNamingStrategy.
 *
 * @example
 * ```typescript
 * @Entity('services')
 * export class Service extends TenantEntity { ... }
 * ```
 */
export function Entity(name?: string, options?: EntityOptions): ClassDecorator {
  return (target) => {
    if (!getEntityScope(target)) {
      throw new Error(
        `@Entity(${name ? `'${name}'` : ''}) on ${target.name}: the class must extend TenantEntity ` +
          '(multitenant table) or GlobalEntity (table without tenant).',
      );
    }
    TypeOrmEntity(name, options)(target);
  };
}

/**
 * Index of a multitenant table. tenant_id (the partition key) is always the first column, so
 * the index serves the tenant-filtered queries BaseRepository issues.
 *
 * @example
 * ```typescript
 * @Entity('appointments')
 * @TenantIndex(['status', 'scheduledAt'])
 * export class Appointment extends TenantEntity { ... }
 * ```
 */
export function TenantIndex(columns: string[], options?: IndexOptions): ClassDecorator {
  return (target) => {
    if (getEntityScope(target) !== 'tenant') {
      throw new Error(`@TenantIndex on ${target.name}: only entities that extend TenantEntity have tenant_id.`);
    }
    Index(['tenantId', ...columns], options)(target);
  };
}
