/**
 * Entity scope: whether a table belongs to a tenant ("multitenant") or is global.
 *
 * The scope is declared by INHERITANCE (TenantEntity / GlobalEntity) and stored as a static
 * marker, so it is inherited by every subclass and can be read from the entity class alone
 * (BaseRepository, the @Entity decorator and the audit subscriber all use it).
 */
export type EntityScope = 'tenant' | 'global';

export const ENTITY_SCOPE = Symbol.for('@dating-app/events:entity-scope');

/** Scope of an entity class; undefined for entities that do not extend TenantEntity / GlobalEntity (legacy) */
export function getEntityScope(target: unknown): EntityScope | undefined {
  if (typeof target !== 'function') {
    return undefined;
  }
  return (target as any)[ENTITY_SCOPE];
}

export function isMultiTenantEntity(target: unknown): boolean {
  return getEntityScope(target) === 'tenant';
}
