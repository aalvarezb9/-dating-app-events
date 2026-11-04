import { ObjectLiteral, Repository } from 'typeorm';

export interface SnapshotPage<T> {
  items: T[];
  /** Pass it back as `cursor` to get the next page; null on the last page */
  nextCursor: string | null;
}

export interface SnapshotQuery {
  /** ISO date: only rows modified at or after it (incremental reconciliation) */
  updatedSince?: string;
  cursor?: string;
  limit?: number;
}

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 500;

export function encodeSnapshotCursor(modifiedAt: Date, id: string): string {
  return Buffer.from(`${modifiedAt.toISOString()}|${id}`).toString('base64url');
}

export function decodeSnapshotCursor(cursor: string): { modifiedAt: Date; id: string } {
  const [modifiedAt, id] = Buffer.from(cursor, 'base64url').toString().split('|');
  const date = new Date(modifiedAt);
  if (!id || Number.isNaN(date.getTime())) {
    throw new Error('Invalid snapshot cursor');
  }
  return { modifiedAt: date, id };
}

/**
 * OWNER side: one page of a table for consumers that start from scratch or reconcile.
 *
 * Keyset pagination by (modified_at, id): stable while rows change, no OFFSET. Soft-deleted rows
 * ARE included (the caller maps `deletedAt` to a *_DELETED payload) so deletions replicate.
 * Use it from an internal controller (`@InternalApi()`), mapping each row to the same contract
 * the *_UPSERTED event carries.
 *
 * `where` must hold the tenant condition when the endpoint is tenant-scoped (internal endpoints
 * are cross-tenant: the repository does not add it for you).
 */
export async function readSnapshotPage<E extends ObjectLiteral>(
  repository: Repository<E>,
  query: SnapshotQuery & { where?: Record<string, unknown> },
): Promise<SnapshotPage<E>> {
  const limit = Math.min(Math.max(query.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);

  const qb = repository.createQueryBuilder('e').withDeleted();

  for (const [field, value] of Object.entries(query.where ?? {})) {
    qb.andWhere(`e.${field} = :where_${field}`, { [`where_${field}`]: value });
  }
  if (query.updatedSince) {
    qb.andWhere('e.modifiedAt >= :since', { since: new Date(query.updatedSince) });
  }
  if (query.cursor) {
    const { modifiedAt, id } = decodeSnapshotCursor(query.cursor);
    qb.andWhere('(e.modifiedAt, e.id) > (:cursorModifiedAt, :cursorId)', {
      cursorModifiedAt: modifiedAt,
      cursorId: id,
    });
  }

  const rows = await qb
    .orderBy('e.modifiedAt', 'ASC')
    .addOrderBy('e.id', 'ASC')
    .limit(limit + 1)
    .getMany();

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const last: any = items[items.length - 1];

  return { items, nextCursor: hasMore && last ? encodeSnapshotCursor(last.modifiedAt, last.id) : null };
}

/**
 * CONSUMER side: walk every page of an owner's snapshot and hand each page to `apply`
 * (normally applyProjection per item). Safe to repeat: applyProjection ignores stale rows.
 *
 * @returns number of rows read
 */
export async function syncSnapshot<T>(
  fetchPage: (cursor?: string) => Promise<SnapshotPage<T>>,
  apply: (items: T[]) => Promise<void>,
): Promise<number> {
  let cursor: string | undefined;
  let total = 0;
  do {
    const page = await fetchPage(cursor);
    if (page.items.length > 0) {
      await apply(page.items);
      total += page.items.length;
    }
    cursor = page.nextCursor ?? undefined;
  } while (cursor);
  return total;
}
