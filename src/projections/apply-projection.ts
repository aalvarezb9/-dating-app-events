import { EntityManager, EntityTarget, ObjectLiteral } from 'typeorm';
import { ProjectionPayload } from '../contracts/catalog.contracts';
import { ProjectedEntity } from './projected-entity';

/**
 * Apply one event (or one snapshot row) to a projection table.
 *
 * - Idempotent: the same payload twice changes nothing.
 * - Ordered by version: a payload whose sourceVersion is not newer than the stored one is
 *   ignored (late or duplicated events, snapshot rows older than a live event).
 * - Deletions are tombstones (deleted_at), never physical deletes.
 * - Never emits events (so projections cannot echo back to the owner).
 *
 * Run it inside a transaction (`dataSource.transaction`) and, outside an HTTP request, inside
 * `ExecutionContext.run({ tenantId }, …)`.
 *
 * @returns true when the projection changed, false when the payload was stale
 */
export async function applyProjection<E extends ProjectedEntity & ObjectLiteral>(
  manager: EntityManager,
  target: EntityTarget<E>,
  payload: ProjectionPayload & Record<string, any>,
  options: { deleted?: boolean } = {},
): Promise<boolean> {
  const repository = manager.getRepository(target);

  const existing = (await repository.findOne({
    where: { id: payload.id } as any,
    withDeleted: true,
    lock: { mode: 'pessimistic_write' },
  })) as E | null;

  if (existing && Number(existing.sourceVersion) >= payload.sourceVersion) {
    return false;
  }

  const { id, tenantId, sourceVersion, ...fields } = payload;
  await repository.save(
    repository.create({
      ...fields,
      id,
      tenantId,
      sourceVersion,
      deletedAt: options.deleted ? new Date() : null,
    } as any) as any,
  );
  return true;
}
