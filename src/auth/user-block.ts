import { Logger } from '@nestjs/common';
import { TenantBlockCache } from './tenant-block';

/**
 * Cuts the sessions of a person that was deleted or banned.
 *
 * The services have no permission on the identity provider, so they cannot ask it whether a user still exists (as they did with
 * Supabase). `auth`, which does, writes this flag when it deletes or bans a user, and every service checks it when it validates a
 * token. Same contract as the flags of the tenants: state, not cache; Redis down = the check is skipped (fail open, with a warning).
 */
export const USER_BLOCK_TTL_MS = 24 * 60 * 60 * 1000;

const logger = new Logger('UserBlock');
const keyOf = (userId: string) => `user-blocked:${userId}`;

/** True when the user is blocked (deleted or banned); false when it is not, or when the cache cannot be read */
export async function userBlockedWith(cache: TenantBlockCache | undefined, userId: string | undefined): Promise<boolean> {
  if (!cache || !userId) {
    return false;
  }
  try {
    return Boolean(await cache.get(keyOf(userId)));
  } catch (error: any) {
    logger.warn(`Could not read the block flag of user ${userId}: ${error?.message}`);
    return false;
  }
}

export async function blockUser(cache: TenantBlockCache, userId: string): Promise<void> {
  await cache.set(keyOf(userId), true, USER_BLOCK_TTL_MS);
}

export async function unblockUser(cache: TenantBlockCache, userId: string): Promise<void> {
  await cache.del(keyOf(userId));
}
