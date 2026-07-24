/**
 * Generic database adapter interface
 * Supports PostgreSQL (TypeORM), DynamoDB, Redis, etc.
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
   * Find multiple entities by criteria
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
   * Soft delete entity (mark as deleted without removing from database)
   */
  softDelete(id: string): Promise<void>;

  /**
   * Restore soft-deleted entity
   */
  restore(id: string): Promise<void>;

  /**
   * Count entities matching criteria
   */
  count(criteria?: FindCriteria): Promise<number>;

  /**
   * Check if entity exists
   */
  exists(criteria: FindCriteria): Promise<boolean>;
}

/**
 * Criteria for finding entities
 */
export interface FindCriteria {
  [key: string]: any;
}

/**
 * Options for finding entities
 */
export interface FindOptions {
  limit?: number;
  offset?: number;
  orderBy?: { [key: string]: 'ASC' | 'DESC' };
  relations?: string[];
  select?: string[];
}

/**
 * Database type supported
 */
export enum DatabaseType {
  POSTGRES = 'postgres',
  DYNAMODB = 'dynamodb',
  REDIS = 'redis',
  MONGODB = 'mongodb',
}
