import { Column, CreateDateColumn, Index, UpdateDateColumn } from 'typeorm';
import { ENTITY_SCOPE } from './entity-scope';

/**
 * Columns every table of every service carries:
 * created_at, modified_at (set by the database layer), created_by, modified_by (set by
 * AuditSubscriber from the ExecutionContext user, or "system:<SERVICE_NAMESPACE>" for jobs).
 *
 * Do not extend this class directly: extend TenantEntity (multitenant table) or GlobalEntity.
 */
export abstract class AuditedEntity {
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'modified_at', type: 'timestamptz' })
  modifiedAt!: Date;

  /** Nullable so the columns can be added to tables that already hold rows */
  @Column({ name: 'created_by', type: 'varchar', length: 100, nullable: true, update: false })
  createdBy!: string | null;

  @Column({ name: 'modified_by', type: 'varchar', length: 100, nullable: true })
  modifiedBy!: string | null;
}

/**
 * Multitenant table: adds tenant_id (required, indexed, immutable).
 *
 * tenant_id is the PARTITION KEY of the table: BaseRepository filters by it on every query,
 * indexes of the table start with it (@TenantIndex) and it is the default grouping key for
 * events. On insert it is taken from the ExecutionContext when the entity does not set it.
 */
export abstract class TenantEntity extends AuditedEntity {
  static readonly [ENTITY_SCOPE] = 'tenant' as const;

  @Index()
  @Column({ name: 'tenant_id', type: 'uuid', update: false })
  tenantId!: string;
}

/**
 * Table that does not belong to a tenant (infrastructure such as the outbox, or catalogs
 * shared by the whole platform). BaseRepository applies no tenant filter to it.
 */
export abstract class GlobalEntity extends AuditedEntity {
  static readonly [ENTITY_SCOPE] = 'global' as const;
}
