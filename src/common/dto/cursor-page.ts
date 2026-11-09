import { BadRequestException } from '@nestjs/common';

/**
 * Pagination by CURSOR, for lists over big tables (the administration reads every user, every appointment).
 *
 * `OFFSET` makes the database walk and throw away every row before the page, and `COUNT(*)` scans the table; a
 * cursor does neither: the next page starts right after the sort key of the last row, found by walking an index.
 * The cost of a page is the same on page 1 and on page 10 000. The price is that there is no total and no jump to
 * page N, which an administration list does not need.
 *
 * The sort key is `(created_at, id)`, newest first, so a list needs an index on those columns (after the equality
 * filters it uses). See `findPage` in backend-dating-admin-saas (audit log) for the query.
 */

/** Where a page ends: the sort key of its last row. The next page starts right after it. */
export interface PageCursor {
  /** ISO instant WITH MICROSECONDS (`2030-06-20T15:00:00.123456Z`): a JS Date would lose them and skip rows */
  at: string;
  id: string;
}

const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The instant of a row as text with microseconds, to put in the select next to the row: `created_at` is a
 * timestamptz and a JS Date keeps only milliseconds. `column` must be a trusted SQL identifier, never user input.
 */
export const cursorAtSql = (column: string): string => `to_char(${column} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;

/** The row comparison that continues strictly after a cursor, for a query sorted by (created_at DESC, id DESC) */
export const afterCursorSql = (createdAt: string, id: string): string =>
  `(${createdAt}, ${id}) < (:cursorAt::timestamptz, :cursorId::uuid)`;

export const encodeCursor = (cursor: PageCursor): string => Buffer.from(JSON.stringify(cursor)).toString('base64url');

/** What arrives from a client is not trusted: anything that is not a cursor this code made is a 400 */
export function decodeCursor(value: string): PageCursor {
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    if (typeof parsed?.at === 'string' && INSTANT.test(parsed.at) && typeof parsed?.id === 'string' && UUID.test(parsed.id)) {
      return { at: parsed.at, id: parsed.id };
    }
  } catch {
    // falls through to the error below
  }
  throw new BadRequestException('The cursor is not valid');
}

/** A page of a list read by cursor: no total (counting a big table is a full scan), only whether there is more */
export interface CursorPage<T> {
  data: T[];
  meta: { limit: number; hasMore: boolean; nextCursor: string | null };
}

/**
 * Builds the page from `limit + 1` rows read newest first: the extra row only says there is more. `cursorAtOf`
 * gives the microsecond text of a row (read with `cursorAtSql`) and `idOf` its id.
 */
export function toCursorPage<T>(rows: T[], limit: number, cursorAtOf: (index: number) => string, idOf: (row: T) => string): CursorPage<T> {
  const hasMore = rows.length > limit;
  const data = hasMore ? rows.slice(0, limit) : rows;
  const last = data.length > 0 ? { at: cursorAtOf(data.length - 1), id: idOf(data[data.length - 1]) } : null;
  return { data, meta: { limit, hasMore, nextCursor: hasMore && last ? encodeCursor(last) : null } };
}
