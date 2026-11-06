import { Logger } from '@nestjs/common';

/**
 * What the block flags need from the cache. A structural type on purpose: each service has its own copy
 * of `cache-manager`, and their `Cache` types are not assignable to one another.
 */
export interface TenantBlockCache {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown, ttl?: number): Promise<unknown>;
  del(key: string): Promise<unknown>;
}

/**
 * Cuts the sessions of a tenant that is not active (pending, suspended or rejected).
 *
 * A JWT is valid until it expires (1 h) whatever happens to the account afterwards, so the owner of the
 * tenants (auth) writes a flag in the shared Redis and every service checks it when it validates a
 * token (SupabaseJwtStrategy). A tenant that is `pending` has no session to cut, but its owner could
 * still ask the identity provider for a token directly, so it is blocked too.
 *
 * The flag is state, not a cache: auth writes it whenever a tenant stops being active and re-arms it
 * every few minutes for all the tenants that are not active (TenantStatusService), so it survives a
 * Redis restart. The TTL only lets a forgotten flag disappear. Redis down = the check is skipped (fail
 * open, with a warning): losing the cache must not take every service down.
 */
export const TENANT_BLOCK_TTL_MS = 24 * 60 * 60 * 1000;

const logger = new Logger('TenantBlock');
const keyOf = (tenantId: string) => `tenant-blocked:${tenantId}`;

/** The status the tenant was blocked with, or null when it is not blocked (or the cache cannot be read) */
export async function tenantBlockedWith(cache: TenantBlockCache | undefined, tenantId: string | undefined): Promise<string | null> {
  if (!cache || !tenantId) {
    return null;
  }
  try {
    return ((await cache.get(keyOf(tenantId))) as string | undefined) ?? null;
  } catch (error: any) {
    logger.warn(`Could not read the block flag of tenant ${tenantId}: ${error?.message}`);
    return null;
  }
}

export async function blockTenant(cache: TenantBlockCache, tenantId: string, status: string): Promise<void> {
  await cache.set(keyOf(tenantId), status, TENANT_BLOCK_TTL_MS);
}

export async function unblockTenant(cache: TenantBlockCache, tenantId: string): Promise<void> {
  await cache.del(keyOf(tenantId));
}
