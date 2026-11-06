import { Logger } from '@nestjs/common';
import { Cache } from 'cache-manager';

/**
 * Cuts the sessions of a tenant that is not active (pending, suspended or rejected).
 *
 * A JWT is valid until it expires (1 h) whatever happens to the account afterwards, so the owner of the
 * tenants (auth) writes a flag in the shared Redis and every service checks it when it validates a
 * token (SupabaseJwtStrategy). The flag outlives any token that could still be in circulation; auth
 * also bans the users in the identity provider so they cannot get new tokens with a refresh token.
 *
 * Redis down = the check is skipped (fail open, with a warning): losing the cache must not take every
 * service down, and the ban still stops the refresh.
 */
export const TENANT_BLOCK_TTL_MS = 2 * 60 * 60 * 1000; // longer than the access token (1 h)

const logger = new Logger('TenantBlock');
const keyOf = (tenantId: string) => `tenant-blocked:${tenantId}`;

/** The status the tenant was blocked with, or null when it is not blocked (or the cache cannot be read) */
export async function tenantBlockedWith(cache: Cache | undefined, tenantId: string | undefined): Promise<string | null> {
  if (!cache || !tenantId) {
    return null;
  }
  try {
    return ((await cache.get<string>(keyOf(tenantId))) as string | undefined) ?? null;
  } catch (error: any) {
    logger.warn(`Could not read the block flag of tenant ${tenantId}: ${error?.message}`);
    return null;
  }
}

export async function blockTenant(cache: Cache, tenantId: string, status: string): Promise<void> {
  await cache.set(keyOf(tenantId), status, TENANT_BLOCK_TTL_MS);
}

export async function unblockTenant(cache: Cache, tenantId: string): Promise<void> {
  await cache.del(keyOf(tenantId));
}
