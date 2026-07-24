/**
 * Generic find criteria (where conditions)
 */
export type FindCriteria = Record<string, any>;

/**
 * Find options (limit, offset, orderBy, etc.)
 */
export interface FindOptions {
  limit?: number;
  offset?: number;
  orderBy?: Record<string, 'ASC' | 'DESC'>;
  relations?: string[];
  select?: string[];
}

/**
 * Database type enum
 */
export enum DatabaseType {
  POSTGRES = 'postgres',
  DYNAMODB = 'dynamodb',
  REDIS = 'redis',
  MONGODB = 'mongodb',
}

/**
 * Generic database adapter interface
 * Allows BaseRepository to work with any database type
 */
export interface IDatabaseAdapter<Entity = any> {
  /**
   * Create a new entity
   */
  create(entity: Partial<Entity>): Promise<Entity>;

  /**
   * Create multiple entities
   */
  createMany(entities: Partial<Entity>[]): Promise<Entity[]>;

  /**
   * Update an existing entity
   */
  update(id: string, partialEntity: Partial<Entity>): Promise<Entity>;

  /**
   * Find one entity by criteria
   */
  findOne(criteria: FindCriteria): Promise<Entity | null>;

  /**
   * Find multiple entities
   */
  findMany(criteria: FindCriteria, options?: FindOptions): Promise<Entity[]>;

  /**
   * Find entity by ID
   */
  findById(id: string): Promise<Entity | null>;

  /**
   * Delete entity permanently
   */
  delete(id: string): Promise<void>;

  /**
   * Soft delete entity (mark as deleted)
   */
  softDelete(id: string): Promise<void>;

  /**
   * Restore soft-deleted entity
   */
  restore(id: string): Promise<void>;

  /**
   * Count entities
   */
  count(criteria?: FindCriteria): Promise<number>;

  /**
   * Check if entity exists
   */
  exists(criteria: FindCriteria): Promise<boolean>;
}
