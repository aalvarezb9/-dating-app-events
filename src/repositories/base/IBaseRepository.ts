/**
 * Base repository interface with common CRUD operations
 * All domain repository interfaces should extend this
 *
 * @template T - The domain entity type
 *
 * @example
 * ```typescript
 * export interface IUserRepository extends IBaseRepository<User> {
 *   findByEmail(email: string): Promise<User | null>;
 *   findByTenant(tenantId: string): Promise<User[]>;
 * }
 * ```
 */
export interface IBaseRepository<T> {
  /**
   * Save entity (create or update)
   */
  save(entity: T): Promise<void>;

  /**
   * Find entity by ID
   */
  findById(id: string): Promise<T | null>;

  /**
   * Delete entity
   */
  delete(entity: T): Promise<void>;
}
