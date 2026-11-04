import { Global, Injectable, Module } from '@nestjs/common';
import { DataSource, EntitySubscriberInterface, InsertEvent, UpdateEvent } from 'typeorm';
import { ExecutionContext } from '../../common/context/execution-context.service';
import { SharedConfigService } from '../../config/env.config';
import { SharedConfigModule } from '../../config/shared-config.module';
import { AuditActor } from './audit-actor';
import { getEntityScope } from './entity-scope';

/**
 * Fills the audit columns of every entity that extends TenantEntity / GlobalEntity:
 * - insert: created_by, modified_by and (TenantEntity) tenant_id when the entity does not set it
 * - update: modified_by
 * (created_at / modified_at are handled by the database layer.)
 *
 * Not called for query builder writes: use auditFields() there.
 */
@Injectable()
export class AuditSubscriber implements EntitySubscriberInterface {
  constructor(dataSource: DataSource, config: SharedConfigService) {
    AuditActor.setSystemActor(`system:${config.serviceNamespace}`);
    dataSource.subscribers.push(this);
  }

  beforeInsert(event: InsertEvent<any>): void {
    const scope = getEntityScope(event.metadata.target);
    if (!scope || !event.entity) {
      return;
    }

    const actor = AuditActor.current();
    event.entity.createdBy ??= actor;
    event.entity.modifiedBy ??= actor;

    if (scope === 'tenant' && !event.entity.tenantId) {
      const tenantId = ExecutionContext.getTenantId();
      if (!tenantId) {
        throw new Error(
          `Cannot insert ${event.metadata.name}: tenantId is not set and there is no tenant in the ExecutionContext.`,
        );
      }
      event.entity.tenantId = tenantId;
    }
  }

  beforeUpdate(event: UpdateEvent<any>): void {
    if (!getEntityScope(event.metadata.target) || !event.entity) {
      return;
    }
    event.entity.modifiedBy = AuditActor.current();
  }
}

/** Registers AuditSubscriber. Import once in the AppModule, after TypeOrmModule. */
@Global()
@Module({
  imports: [SharedConfigModule],
  providers: [AuditSubscriber],
  exports: [AuditSubscriber],
})
export class AuditModule {}
