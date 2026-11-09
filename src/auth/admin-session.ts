import { Logger } from '@nestjs/common';
import { TenantBlockCache } from './tenant-block';

/**
 * The sessions of the super administrators that passed the second factor.
 *
 * GoTrue gives a token to anyone who knows the password, directly and without asking auth anything, so the
 * second factor (a code by email) cannot live only in the login endpoint of auth: a token asked for straight to
 * the identity provider would skip it. So auth records the id of the session (`session_id` claim of the token)
 * in the shared Redis once the code is right, and every service refuses a token of a super administrator whose
 * session is not recorded (SupabaseJwtStrategy). A session opened without the second factor is never recorded.
 *
 * Unlike the block flags of a tenant, this check FAILS CLOSED: when the cache cannot be read the token of a super
 * administrator is refused, because letting it through would skip the second factor.
 */
const logger = new Logger('AdminSession');
const keyOf = (sessionId: string) => `admin-session:${sessionId}`;

/** Records a session as verified for `ttlMs` (the longest an administrator can stay without logging in again) */
export async function authorizeAdminSession(cache: TenantBlockCache, sessionId: string, ttlMs: number): Promise<void> {
  await cache.set(keyOf(sessionId), '1', ttlMs);
}

export async function revokeAdminSession(cache: TenantBlockCache, sessionId: string): Promise<void> {
  await cache.del(keyOf(sessionId));
}

/** True only when the session was recorded after a second factor and has not expired or been revoked */
export async function isAdminSessionAuthorized(cache: TenantBlockCache | undefined, sessionId: string | undefined): Promise<boolean> {
  if (!cache || !sessionId) {
    return false;
  }
  try {
    const value = await cache.get(keyOf(sessionId));
    return value !== undefined && value !== null;
  } catch (error: any) {
    logger.warn(`Could not read the admin session ${sessionId}: ${error?.message}`);
    return false;
  }
}

/** The `session_id` claim GoTrue puts in every access token, read without verifying it (the caller trusts the token it just received) */
export function sessionIdOfToken(accessToken: string): string | undefined {
  try {
    const payload = JSON.parse(Buffer.from(accessToken.split('.')[1], 'base64url').toString('utf8'));
    return typeof payload.session_id === 'string' ? payload.session_id : undefined;
  } catch {
    return undefined;
  }
}
