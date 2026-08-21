import { DataSource, EntityManager } from 'typeorm';
import { Logger } from '@nestjs/common';

/**
 * Advisory Lock Manager
 *
 * Provides utilities for PostgreSQL advisory locks to prevent race conditions.
 * Advisory locks are automatically released when the transaction commits or rolls back.
 *
 * @example
 * ```typescript
 * await AdvisoryLockManager.runWithLocks(
 *   dataSource,
 *   [
 *     { resourceType: 'subdomain', resourceId: 'my-salon' },
 *     { resourceType: 'tenant', resourceId: 'tenant-123' }
 *   ],
 *   async (manager) => {
 *     // Your transactional code here
 *     // Locks are held for the duration of this callback
 *   }
 * );
 * ```
 */
export class AdvisoryLockManager {
  private static readonly logger = new Logger(AdvisoryLockManager.name);

  /**
   * Generate a deterministic lock key from resource parameters
   *
   * Uses FNV-1a hash algorithm to generate consistent 32-bit integers
   * from resource identifiers.
   *
   * @param params - Record of resource identifiers (e.g., { resourceType: 'user', userId: '123' })
   * @returns 32-bit positive integer suitable for pg_advisory_xact_lock()
   *
   * @example
   * ```typescript
   * const lockKey = AdvisoryLockManager.generateLockKey({
   *   resourceType: 'appointment',
   *   businessId: 'biz-123',
   *   teamMemberId: 'team-456',
   *   date: '2024-01-15'
   * });
   * // Returns: 2847563291 (or similar deterministic value)
   * ```
   */
  static generateLockKey(params: Record<string, string | number>): number {
    // Sort keys alphabetically for deterministic ordering
    const sortedKeys = Object.keys(params).sort();

    // Build lock string from sorted params
    const lockString = sortedKeys
      .map((key) => `${key}:${params[key]}`)
      .join('|');

    // FNV-1a hash function
    let hash = 2166136261; // FNV offset basis (32-bit)

    for (let i = 0; i < lockString.length; i++) {
      hash ^= lockString.charCodeAt(i);
      hash = Math.imul(hash, 16777619); // FNV prime (32-bit)
    }

    // Ensure positive 32-bit integer (PostgreSQL bigint range)
    return Math.abs(hash) >>> 0;
  }

  /**
   * Execute a callback within a transaction with advisory locks
   *
   * Locks are acquired in deterministic order (sorted by lock key value)
   * to prevent deadlocks. All locks are automatically released when the
   * transaction commits or rolls back.
   *
   * @param dataSource - TypeORM DataSource
   * @param lockParams - Array of lock parameter objects to acquire
   * @param callback - Async function to execute with locks held
   * @param options - Transaction options (isolation level, etc.)
   * @returns Promise resolving to callback return value
   *
   * @example
   * ```typescript
   * // Lock a subdomain and tenant before registering
   * const result = await AdvisoryLockManager.runWithLocks(
   *   dataSource,
   *   [
   *     { resourceType: 'subdomain', subdomain: 'my-salon' },
   *     { resourceType: 'tenant', tenantId: 'tenant-123' }
   *   ],
   *   async (manager) => {
   *     // Check if subdomain exists
   *     // Create subdomain if available
   *     return subdomain;
   *   },
   *   { isolationLevel: 'READ COMMITTED' }
   * );
   * ```
   */
  static async runWithLocks<T>(
    dataSource: DataSource,
    lockParams: Array<Record<string, string | number>>,
    callback: (manager: EntityManager) => Promise<T>,
    options?: {
      isolationLevel?:
        | 'READ UNCOMMITTED'
        | 'READ COMMITTED'
        | 'REPEATABLE READ'
        | 'SERIALIZABLE';
      enableLogging?: boolean;
    },
  ): Promise<T> {
    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();

    try {
      // Start transaction with specified isolation level
      if (options?.isolationLevel) {
        await queryRunner.query(
          `SET TRANSACTION ISOLATION LEVEL ${options.isolationLevel}`,
        );
      }
      await queryRunner.startTransaction();

      // Generate lock keys and sort them to prevent deadlocks
      const locks = lockParams
        .map((params) => ({
          params,
          lockKey: this.generateLockKey(params),
        }))
        .sort((a, b) => a.lockKey - b.lockKey); // Deterministic ordering

      // Acquire all locks in sorted order
      for (const { params, lockKey } of locks) {
        if (options?.enableLogging) {
          this.logger.debug(
            `Acquiring advisory lock ${lockKey} for ${JSON.stringify(params)}`,
          );
        }

        await queryRunner.query('SELECT pg_advisory_xact_lock($1)', [lockKey]);

        if (options?.enableLogging) {
          this.logger.debug(`Lock ${lockKey} acquired`);
        }
      }

      // Execute callback with EntityManager
      const result = await callback(queryRunner.manager);

      // Commit transaction (releases locks automatically)
      await queryRunner.commitTransaction();

      if (options?.enableLogging) {
        this.logger.debug(
          `Transaction committed, ${locks.length} locks released`,
        );
      }

      return result;
    } catch (error) {
      // Rollback on error (releases locks automatically)
      await queryRunner.rollbackTransaction();

      if (options?.enableLogging) {
        this.logger.error(
          `Transaction rolled back due to error: ${error.message}`,
        );
      }

      throw error;
    } finally {
      // Release query runner
      await queryRunner.release();
    }
  }

  /**
   * Convenience method for single-lock operations
   *
   * @param dataSource - TypeORM DataSource
   * @param lockParams - Single lock parameter object
   * @param callback - Async function to execute with lock held
   * @param options - Transaction options
   * @returns Promise resolving to callback return value
   *
   * @example
   * ```typescript
   * const result = await AdvisoryLockManager.runWithLock(
   *   dataSource,
   *   { resourceType: 'user', userId: 'user-123' },
   *   async (manager) => {
   *     // Your code here
   *   }
   * );
   * ```
   */
  static async runWithLock<T>(
    dataSource: DataSource,
    lockParams: Record<string, string | number>,
    callback: (manager: EntityManager) => Promise<T>,
    options?: {
      isolationLevel?:
        | 'READ UNCOMMITTED'
        | 'READ COMMITTED'
        | 'REPEATABLE READ'
        | 'SERIALIZABLE';
      enableLogging?: boolean;
    },
  ): Promise<T> {
    return this.runWithLocks(dataSource, [lockParams], callback, options);
  }
}
