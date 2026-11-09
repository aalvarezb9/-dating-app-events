import { Logger } from '@nestjs/common';
import { TenantBlockCache } from './tenant-block';

/**
 * The sessions in which a super administrator acts as another person to give them support ("log in as").
 *
 * Auth signs a short token for the person (with the same secret every service already verifies) that says WHO is
 * acting for them (`app_metadata.impersonatedBy`) and in which mode (`supportMode`): `read_only` (the default: it
 * can look at what the person sees, nothing else) or `full`. The token carries a `session_id` and has no refresh token.
 *
 * Auth records the session in the shared Redis when it opens it, and every service refuses a token that claims to
 * be a support session whose id is not recorded (SupabaseJwtStrategy), so ending a session cuts it at once in every
 * service even though the token has not expired. Like the sessions of the super administrators, the check FAILS
 * CLOSED: when the cache cannot be read the token is refused.
 */
const logger = new Logger('SupportSession');
const keyOf = (sessionId: string) => `support-session:${sessionId}`;

export type SupportMode = 'read_only' | 'full';

/** Records a support session as open for `ttlMs` (its token expires then anyway) */
export async function openSupportSession(cache: TenantBlockCache, sessionId: string, ttlMs: number): Promise<void> {
  await cache.set(keyOf(sessionId), '1', ttlMs);
}

export async function closeSupportSession(cache: TenantBlockCache, sessionId: string): Promise<void> {
  await cache.del(keyOf(sessionId));
}

/** True only when the session was opened by auth and has not ended or expired */
export async function isSupportSessionOpen(cache: TenantBlockCache | undefined, sessionId: string | undefined): Promise<boolean> {
  if (!cache || !sessionId) {
    return false;
  }
  try {
    const value = await cache.get(keyOf(sessionId));
    return value !== undefined && value !== null;
  } catch (error: any) {
    logger.warn(`Could not read the support session ${sessionId}: ${error?.message}`);
    return false;
  }
}

/** Methods that only look: the only ones a `read_only` support session may use */
export const SAFE_HTTP_METHODS: ReadonlySet<string> = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Routes a support session can never use, whatever its mode: the credentials of the person are theirs alone.
 * (Matched against the path without the query string.)
 */
export const FORBIDDEN_IN_SUPPORT_SESSION: readonly RegExp[] = [/\/auth\/change-password$/];
