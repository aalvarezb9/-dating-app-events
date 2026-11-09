import { Logger } from '@nestjs/common';
import { TenantBlockCache } from './tenant-block';

/**
 * Feature flags: switches the administration turns on and off without deploying, for everybody or for some
 * businesses only (a gradual roll-out).
 *
 * The administration owns them (the source of truth is its database) and publishes each one in the shared Redis;
 * any service asks `isFeatureEnabled(cache, 'new_calendar', tenantId)`. The check is a single cache read.
 *
 * - A flag nobody created is OFF.
 * - A flag that is on and has no `tenantIds` is on for every business; with `tenantIds` only for those.
 * - When the cache cannot be read the feature is OFF (the safe side: a feature that is not there is not used by
 *   mistake). Redis down never takes a service down.
 *
 * The administration re-publishes every flag every few minutes, so they survive a restart of Redis.
 */
export interface FeatureFlagState {
  key: string;
  enabled: boolean;
  /** When given, the flag is on only for these businesses (tenants) */
  tenantIds?: string[] | null;
}

/** How long a published flag lives in the cache if nobody re-publishes it */
export const FEATURE_FLAG_TTL_MS = 24 * 60 * 60 * 1000;

/** Keys are lowercase words with dots, dashes and underscores, 3 to 60 characters, starting with a letter */
export const FEATURE_FLAG_KEY = /^[a-z][a-z0-9_.-]{2,59}$/;

const logger = new Logger('FeatureFlags');
const keyOf = (key: string) => `feature-flag:${key}`;

export async function publishFeatureFlag(cache: TenantBlockCache, flag: FeatureFlagState): Promise<void> {
  await cache.set(keyOf(flag.key), { enabled: flag.enabled, tenantIds: flag.tenantIds ?? null }, FEATURE_FLAG_TTL_MS);
}

export async function unpublishFeatureFlag(cache: TenantBlockCache, key: string): Promise<void> {
  await cache.del(keyOf(key));
}

/** Whether the feature is on for this business (or for everybody when no tenant is given) */
export async function isFeatureEnabled(cache: TenantBlockCache | undefined, key: string, tenantId?: string): Promise<boolean> {
  if (!cache) {
    return false;
  }
  try {
    const flag = (await cache.get(keyOf(key))) as { enabled?: boolean; tenantIds?: string[] | null } | undefined | null;
    if (!flag?.enabled) {
      return false;
    }
    if (!flag.tenantIds || flag.tenantIds.length === 0) {
      return true;
    }
    return tenantId !== undefined && flag.tenantIds.includes(tenantId);
  } catch (error: any) {
    logger.warn(`Could not read the feature flag ${key}: ${error?.message}`);
    return false;
  }
}
