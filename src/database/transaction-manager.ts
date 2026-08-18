import { DataSource, EntityManager } from 'typeorm';
import { Logger } from '@nestjs/common';

/**
 * Cleanup callback type
 * Executed during rollback to cleanup external resources (e.g., Supabase Auth users)
 */
export type CleanupCallback = () => Promise<void> | void;

/**
 * Transaction callback type
 * Receives EntityManager and returns result of type R
 */
export type TransactionCallback<R> = (
  manager: EntityManager,
  registerCleanup: (callback: CleanupCallback) => void,
) => Promise<R>;

/**
 * Transaction options
 */
export interface TransactionOptions {
  /**
   * Isolation level for the transaction
   * @default 'READ COMMITTED'
   */
  isolationLevel?:
    | 'READ UNCOMMITTED'
    | 'READ COMMITTED'
    | 'REPEATABLE READ'
    | 'SERIALIZABLE';

  /**
   * Whether to log transaction lifecycle events
   * @default true
   */
  enableLogging?: boolean;
}

/**
 * TransactionManager
 *
 * Reusable wrapper for TypeORM QueryRunner that handles transaction lifecycle
 * and cleanup of external resources on rollback.
 *
 * @example
 * // Basic usage
 * const result = await TransactionManager.run(dataSource, async (manager) => {
 *   const user = manager.create(User, { email: 'test@example.com' });
 *   await manager.save(user);
 *   return user;
 * });
 *
 * @example
 * // With cleanup callbacks (e.g., Supabase Auth)
 * const result = await TransactionManager.run(
 *   dataSource,
 *   async (manager, registerCleanup) => {
 *     // 1. Create user in Supabase Auth (external service)
 *     const { user } = await supabaseAuth.signUp({ email, password });
 *
 *     // 2. Register cleanup in case transaction fails
 *     registerCleanup(async () => {
 *       await supabaseAuth.deleteUser(user.id);
 *     });
 *
 *     // 3. Create records in database (transactional)
 *     const tenant = manager.create(Tenant, { ... });
 *     await manager.save(tenant);
 *
 *     const userRecord = manager.create(User, { supabaseUserId: user.id });
 *     await manager.save(userRecord);
 *
 *     return { user, tenant, userRecord };
 *   }
 * );
 */
export class TransactionManager {
  private static readonly logger = new Logger(TransactionManager.name);

  /**
   * Run a function inside a database transaction
   *
   * Automatically handles:
   * - QueryRunner lifecycle (connect, begin, commit, rollback, release)
   * - Cleanup callbacks on rollback
   * - Error propagation
   *
   * @param dataSource TypeORM DataSource
   * @param callback Transaction callback that receives EntityManager
   * @param options Transaction options (isolation level, logging)
   * @returns Result of the callback
   * @throws Re-throws any error from callback after rollback and cleanup
   */
  static async run<R>(
    dataSource: DataSource,
    callback: TransactionCallback<R>,
    options?: TransactionOptions,
  ): Promise<R> {
    const {
      isolationLevel = 'READ COMMITTED',
      enableLogging = true,
    } = options || {};

    const queryRunner = dataSource.createQueryRunner();
    const cleanupCallbacks: CleanupCallback[] = [];

    try {
      // 1. Connect to database
      await queryRunner.connect();
      if (enableLogging) {
        this.logger.debug('Transaction: Connected to database');
      }

      // 2. Start transaction
      await queryRunner.startTransaction(isolationLevel);
      if (enableLogging) {
        this.logger.debug(`Transaction: Started (isolation: ${isolationLevel})`);
      }

      // 3. Register cleanup function
      const registerCleanup = (cleanupCallback: CleanupCallback) => {
        cleanupCallbacks.push(cleanupCallback);
      };

      // 4. Execute callback with manager
      const result = await callback(queryRunner.manager, registerCleanup);

      // 5. Commit transaction
      await queryRunner.commitTransaction();
      if (enableLogging) {
        this.logger.debug('Transaction: Committed successfully');
      }

      return result;
    } catch (error) {
      // 6. Rollback transaction
      if (queryRunner.isTransactionActive) {
        await queryRunner.rollbackTransaction();
        if (enableLogging) {
          this.logger.warn('Transaction: Rolled back due to error');
        }
      }

      // 7. Execute cleanup callbacks (e.g., delete Supabase Auth user)
      if (cleanupCallbacks.length > 0) {
        if (enableLogging) {
          this.logger.debug(
            `Transaction: Executing ${cleanupCallbacks.length} cleanup callback(s)`,
          );
        }

        await Promise.allSettled(
          cleanupCallbacks.map(async (cleanup) => {
            try {
              await cleanup();
            } catch (cleanupError) {
              this.logger.error(
                `Cleanup callback failed: ${cleanupError}`,
                cleanupError instanceof Error ? cleanupError.stack : undefined,
              );
            }
          }),
        );
      }

      // 8. Re-throw original error
      throw error;
    } finally {
      // 9. Release QueryRunner
      await queryRunner.release();
      if (enableLogging) {
        this.logger.debug('Transaction: Released QueryRunner');
      }
    }
  }

  /**
   * Run a function inside a transaction WITHOUT cleanup callbacks
   * Use this when you don't need to cleanup external resources
   *
   * @param dataSource TypeORM DataSource
   * @param callback Simplified callback that only receives EntityManager
   * @param options Transaction options
   * @returns Result of the callback
   */
  static async runSimple<R>(
    dataSource: DataSource,
    callback: (manager: EntityManager) => Promise<R>,
    options?: TransactionOptions,
  ): Promise<R> {
    return this.run(dataSource, async (manager) => callback(manager), options);
  }
}
