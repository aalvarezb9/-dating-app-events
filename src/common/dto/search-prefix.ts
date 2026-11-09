import { BadRequestException } from '@nestjs/common';

/**
 * Search by text that does NOT scan the table: it matches the START of a value ("sal" finds "Salon Angel"), so the
 * database walks a btree index instead of reading every row. `ILIKE '%text%'` cannot use a btree index and reads the
 * whole table; it is not allowed on big tables.
 *
 * For it to be fast the column needs an index on the lowercase value with the pattern operator class:
 * `CREATE INDEX … ON table (lower(column) text_pattern_ops)`. The query compares the lowercase column:
 * `lower(column) LIKE :pattern ESCAPE '\'`.
 */

/** A search shorter than this matches too much to be useful and is refused */
export const MIN_SEARCH_LENGTH = 3;

/** The longest search accepted */
export const MAX_SEARCH_LENGTH = 60;

/** `lower(column) LIKE :pattern ESCAPE '\'`: the clause that goes with `searchPrefixPattern` */
export const LIKE_ESCAPE = `ESCAPE '\\'`;

/**
 * The pattern for a prefix search: lowercase, with `\`, `%` and `_` escaped (the text is data, never a wildcard) and
 * a `%` at the end. @throws BadRequestException when the text is too short or too long.
 */
export function searchPrefixPattern(text: string): string {
  const normalized = (text ?? '').trim().toLowerCase();
  if (normalized.length < MIN_SEARCH_LENGTH || normalized.length > MAX_SEARCH_LENGTH) {
    throw new BadRequestException(`The search needs between ${MIN_SEARCH_LENGTH} and ${MAX_SEARCH_LENGTH} characters`);
  }
  return `${normalized.replace(/[\\%_]/g, (character) => `\\${character}`)}%`;
}
