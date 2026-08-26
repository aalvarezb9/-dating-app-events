import { Logger } from '@nestjs/common';
import { Cache } from 'cache-manager';

/**
 * Redis Lock Manager
 *
 * Provides utilities for distributed locks in Redis to prevent race conditions.
 * Similar to AdvisoryLockManager (PostgreSQL), but for Redis.
 *
 * Locks are automatically released when TTL expires.
 *
 * Features:
 * - Deterministic key generation using FNV-1a hash (same algorithm as AdvisoryLockManager)
 * - TTL-based automatic expiration
 * - Acquire/release semantics
 * - Lock value storage (e.g., appointmentId)
 *
 * @example
 * ```typescript
 * // Acquire lock
 * const lockAcquired = await RedisLockManager.acquireLock(
 *   cacheManager,
 *   { businessId: 'biz-123', teamId: 'team-456', date: '2024-01-15' },
 *   'appointment-789',
 *   600 // 10 minutes
 * );
 *
 * if (lockAcquired) {
 *   // Lock acquired - proceed with operation
 * } else {
 *   // Lock already held by another process
 * }
 *
 * // Release lock
 * await RedisLockManager.releaseLock(
 *   cacheManager,
 *   { businessId: 'biz-123', teamId: 'team-456', date: '2024-01-15' }
 * );
 * ```
 */
export class RedisLockManager {
  private static readonly logger = new Logger(RedisLockManager.name);

  /**
   * Generate a deterministic lock key from resource parameters
   *
   * Uses FNV-1a hash algorithm to generate consistent 32-bit integers
   * from resource identifiers (same algorithm as AdvisoryLockManager).
   *
   * The hash is converted to a string and prefixed with 'lock:' for Redis.
   *
   * @param params - Record of resource identifiers (e.g., { resourceType: 'user', userId: '123' })
   * @returns Redis lock key (e.g., 'lock:2847563291')
   *
   * @example
   * ```typescript
   * const lockKey = RedisLockManager.generateLockKey({
   *   resourceType: 'appointment',
   *   businessId: 'biz-123',
   *   teamMemberId: 'team-456',
   *   date: '2024-01-15'
   * });
   * // Returns: 'lock:2847563291' (or similar deterministic value)
   * ```
   */
  static generateLockKey(params: Record<string, string | number>): string {
    // Sort keys alphabetically for deterministic ordering
    const sortedKeys = Object.keys(params).sort();

    // Build lock string from sorted params
    const lockString = sortedKeys
      .map((key) => `${key}:${params[key]}`)
      .join('|');

    // FNV-1a hash function (same as AdvisoryLockManager)
    let hash = 2166136261; // FNV offset basis (32-bit)

    for (let i = 0; i < lockString.length; i++) {
      hash ^= lockString.charCodeAt(i);
      hash = Math.imul(hash, 16777619); // FNV prime (32-bit)
    }

    // Ensure positive 32-bit integer
    const hashValue = Math.abs(hash) >>> 0;

    // Return as string with 'lock:' prefix
    return `lock:${hashValue}`;
  }

  /**
   * Acquire a lock with TTL
   *
   * Attempts to set a lock key in Redis. If the key already exists,
   * the lock is considered held by another process.
   *
   * @param cacheManager - NestJS Cache Manager instance
   * @param params - Lock parameter object (same format as generateLockKey)
   * @param value - Value to store in lock (e.g., appointmentId, processId)
   * @param ttl - Time to live in seconds
   * @returns true if lock was acquired, false if already held
   *
   * @example
   * ```typescript
   * const lockAcquired = await RedisLockManager.acquireLock(
   *   cacheManager,
   *   { businessId: 'biz-123', teamId: 'team-456', scheduledAt: '2024-01-15T10:00:00Z' },
   *   'appointment-789',
   *   600 // 10 minutes
   * );
   * ```
   */
  static async acquireLock(
    cacheManager: Cache,
    params: Record<string, string | number>,
    value: string,
    ttl: number,
  ): Promise<boolean> {
    try {
      const lockKey = this.generateLockKey(params);

      // Check if lock already exists
      const existing = await cacheManager.get(lockKey);
      if (existing !== null && existing !== undefined) {
        this.logger.debug(
          `Lock already held: ${lockKey} by ${existing}`,
        );
        return false;
      }

      // Acquire lock with TTL
      // cache-manager expects TTL in milliseconds
      await cacheManager.set(lockKey, value, ttl * 1000);

      this.logger.debug(
        `Lock acquired: ${lockKey} = ${value} (TTL: ${ttl}s)`,
      );

      return true;
    } catch (error: any) {
      this.logger.error(
        `Error acquiring lock for ${JSON.stringify(params)}: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Release a lock
   *
   * Deletes the lock key from Redis, making the resource available
   * for other processes.
   *
   * @param cacheManager - NestJS Cache Manager instance
   * @param params - Lock parameter object (same format as generateLockKey)
   *
   * @example
   * ```typescript
   * await RedisLockManager.releaseLock(
   *   cacheManager,
   *   { businessId: 'biz-123', teamId: 'team-456', scheduledAt: '2024-01-15T10:00:00Z' }
   * );
   * ```
   */
  static async releaseLock(
    cacheManager: Cache,
    params: Record<string, string | number>,
  ): Promise<void> {
    try {
      const lockKey = this.generateLockKey(params);
      await cacheManager.del(lockKey);

      this.logger.debug(`Lock released: ${lockKey}`);
    } catch (error: any) {
      this.logger.error(
        `Error releasing lock for ${JSON.stringify(params)}: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Check if a lock is currently held
   *
   * @param cacheManager - NestJS Cache Manager instance
   * @param params - Lock parameter object (same format as generateLockKey)
   * @returns true if lock exists, false otherwise
   *
   * @example
   * ```typescript
   * const isLocked = await RedisLockManager.isLocked(
   *   cacheManager,
   *   { businessId: 'biz-123', teamId: 'team-456', scheduledAt: '2024-01-15T10:00:00Z' }
   * );
   * ```
   */
  static async isLocked(
    cacheManager: Cache,
    params: Record<string, string | number>,
  ): Promise<boolean> {
    try {
      const lockKey = this.generateLockKey(params);
      const value = await cacheManager.get(lockKey);
      const exists = value !== null && value !== undefined;

      this.logger.debug(`Lock ${lockKey} exists: ${exists}`);

      return exists;
    } catch (error: any) {
      this.logger.error(
        `Error checking lock for ${JSON.stringify(params)}: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Get the value stored in a lock
   *
   * Returns the value associated with the lock (e.g., appointmentId),
   * or null if the lock doesn't exist.
   *
   * @param cacheManager - NestJS Cache Manager instance
   * @param params - Lock parameter object (same format as generateLockKey)
   * @returns Lock value or null if not found
   *
   * @example
   * ```typescript
   * const appointmentId = await RedisLockManager.getLockValue(
   *   cacheManager,
   *   { businessId: 'biz-123', teamId: 'team-456', scheduledAt: '2024-01-15T10:00:00Z' }
   * );
   * // Returns: 'appointment-789' or null
   * ```
   */
  static async getLockValue(
    cacheManager: Cache,
    params: Record<string, string | number>,
  ): Promise<string | null> {
    try {
      const lockKey = this.generateLockKey(params);
      const value = await cacheManager.get<string>(lockKey);

      if (value === null || value === undefined) {
        this.logger.debug(`Lock ${lockKey} not found`);
        return null;
      }

      this.logger.debug(`Lock ${lockKey} value: ${value}`);

      return value;
    } catch (error: any) {
      this.logger.error(
        `Error getting lock value for ${JSON.stringify(params)}: ${error.message}`,
      );
      throw error;
    }
  }

  /**
   * Extend lock TTL
   *
   * Note: This requires direct Redis client access (not available in cache-manager).
   * For cache-manager, you must re-set the lock with a new TTL.
   *
   * @param cacheManager - NestJS Cache Manager instance
   * @param params - Lock parameter object (same format as generateLockKey)
   * @param additionalTTL - Additional time in seconds
   *
   * @example
   * ```typescript
   * await RedisLockManager.extendLock(
   *   cacheManager,
   *   { businessId: 'biz-123', teamId: 'team-456', scheduledAt: '2024-01-15T10:00:00Z' },
   *   300 // Add 5 more minutes
   * );
   * ```
   */
  static async extendLock(
    cacheManager: Cache,
    params: Record<string, string | number>,
    additionalTTL: number,
  ): Promise<void> {
    try {
      const lockKey = this.generateLockKey(params);
      const value = await cacheManager.get<string>(lockKey);

      if (value === null || value === undefined) {
        this.logger.warn(`Cannot extend lock ${lockKey} - lock not found`);
        return;
      }

      // Re-set with new TTL (cache-manager limitation)
      await cacheManager.set(lockKey, value, additionalTTL * 1000);

      this.logger.debug(`Lock extended: ${lockKey} (new TTL: ${additionalTTL}s)`);
    } catch (error: any) {
      this.logger.error(
        `Error extending lock for ${JSON.stringify(params)}: ${error.message}`,
      );
      throw error;
    }
  }
}
