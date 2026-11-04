import { ExecutionContext } from '../../common/context/execution-context.service';

/**
 * Who is writing: the authenticated user of the current request, or the service itself
 * ("system:<SERVICE_NAMESPACE>") for consumers, crons and queue jobs that run without a user.
 */
export class AuditActor {
  private static systemActor = 'system';

  /** Set once at startup by AuditModule */
  static setSystemActor(actor: string): void {
    AuditActor.systemActor = actor;
  }

  static current(): string {
    return ExecutionContext.getUserId() || AuditActor.systemActor;
  }
}

/**
 * Audit values for writes that do not go through the entity lifecycle (query builder updates
 * such as compare-and-set), because TypeORM subscribers are not called for them.
 *
 * @example
 * ```typescript
 * await repo.createQueryBuilder().update().set({ status, ...auditFields() }).where(...).execute();
 * ```
 */
export function auditFields(): { modifiedBy: string } {
  return { modifiedBy: AuditActor.current() };
}
