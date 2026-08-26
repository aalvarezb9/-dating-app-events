/**
 * Redis Adapter Interface
 *
 * Defines the contract for Redis cache adapters.
 * Allows different Redis implementations (cache-manager, ioredis, etc.)
 * to be used with BaseRedisRepository.
 *
 * @example
 * ```typescript
 * export class CacheManagerAdapter<T> implements IRedisAdapter<T> {
 *   constructor(private cacheManager: Cache) {}
 *
 *   async get(key: string): Promise<T | null> {
 *     return await this.cacheManager.get<T>(key);
 *   }
 *   // ... implement other methods
 * }
 * ```
 */
export interface IRedisAdapter<T = any> {
  /**
   * Get value by key
   * @param key - Redis key
   * @returns Value or null if not found
   */
  get(key: string): Promise<T | null>;

  /**
   * Set value with optional TTL
   * @param key - Redis key
   * @param value - Value to store
   * @param ttl - Time to live in seconds (optional)
   */
  set(key: string, value: T, ttl?: number): Promise<void>;

  /**
   * Delete key
   * @param key - Redis key
   */
  delete(key: string): Promise<void>;

  /**
   * Check if key exists
   * @param key - Redis key
   * @returns true if key exists, false otherwise
   */
  exists(key: string): Promise<boolean>;

  /**
   * Get multiple keys
   * @param keys - Array of Redis keys
   * @returns Array of values (null for non-existent keys)
   */
  mget(keys: string[]): Promise<(T | null)[]>;

  /**
   * Set multiple keys
   * @param entries - Array of key-value pairs
   * @param ttl - Time to live in seconds (optional, applies to all keys)
   */
  mset(entries: Array<{ key: string; value: T }>, ttl?: number): Promise<void>;

  /**
   * Delete multiple keys
   * @param keys - Array of Redis keys
   */
  mdel(keys: string[]): Promise<void>;
}
