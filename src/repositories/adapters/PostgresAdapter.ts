import { Repository, ObjectLiteral } from 'typeorm';
import { IDatabaseAdapter, FindCriteria, FindOptions } from '../base/IDatabaseAdapter';

/**
 * PostgreSQL/TypeORM adapter for BaseRepository
 *
 * @example
 * ```typescript
 * const userRepo = dataSource.getRepository(User);
 * const adapter = new PostgresAdapter(userRepo, {
 *   softDeleteField: 'deleted_at',
 * });
 * ```
 */
export class PostgresAdapter<Entity extends ObjectLiteral = ObjectLiteral> implements IDatabaseAdapter<Entity> {
  constructor(
    private readonly repository: Repository<Entity>,
    private readonly options?: {
      softDeleteField?: string;
      idField?: string;
    },
  ) {
    this.options = {
      softDeleteField: 'deleted_at',
      idField: 'id',
      ...options,
    };
  }

  async create(entity: Partial<Entity>): Promise<Entity> {
    const created = this.repository.create(entity as any);
    return await this.repository.save(created as any) as Entity;
  }

  async createMany(entities: Partial<Entity>[]): Promise<Entity[]> {
    const created = entities.map((e) => this.repository.create(e as any));
    return await this.repository.save(created as any) as Entity[];
  }

  async update(id: string, partialEntity: Partial<Entity>): Promise<Entity> {
    const idField = this.options!.idField!;

    // Fetch the existing entity first
    const existing = await this.repository.findOne({ where: { [idField]: id } as any } as any);
    if (!existing) {
      throw new Error(`Entity with ${idField} ${id} not found`);
    }

    // Merge partial entity with existing (preserves JSONB fields)
    const merged = this.repository.merge(existing, partialEntity as any);

    // Save the merged entity
    return await this.repository.save(merged as any) as Entity;
  }

  async findOne(criteria: FindCriteria): Promise<Entity | null> {
    return await this.repository.findOne({ where: criteria } as any);
  }

  async findMany(criteria: FindCriteria, options?: FindOptions): Promise<Entity[]> {
    const queryOptions: any = {
      where: criteria,
    };

    if (options?.limit) {
      queryOptions.take = options.limit;
    }

    if (options?.offset) {
      queryOptions.skip = options.offset;
    }

    if (options?.orderBy) {
      queryOptions.order = options.orderBy;
    }

    if (options?.relations) {
      queryOptions.relations = options.relations;
    }

    if (options?.select) {
      queryOptions.select = options.select;
    }

    return await this.repository.find(queryOptions);
  }

  async findById(id: string): Promise<Entity | null> {
    const idField = this.options!.idField!;
    return await this.repository.findOne({ where: { [idField]: id } as any } as any);
  }

  async delete(id: string): Promise<void> {
    const idField = this.options!.idField!;
    await this.repository.delete({ [idField]: id } as any);
  }

  async softDelete(id: string): Promise<void> {
    const idField = this.options!.idField!;
    const softDeleteField = this.options!.softDeleteField!;

    await this.repository.update(
      { [idField]: id } as any,
      { [softDeleteField]: new Date() } as any,
    );
  }

  async restore(id: string): Promise<void> {
    const idField = this.options!.idField!;
    const softDeleteField = this.options!.softDeleteField!;

    await this.repository.update(
      { [idField]: id } as any,
      { [softDeleteField]: null } as any,
    );
  }

  async count(criteria?: FindCriteria): Promise<number> {
    return await this.repository.count({ where: criteria || {} } as any);
  }

  async exists(criteria: FindCriteria): Promise<boolean> {
    const count = await this.repository.count({ where: criteria } as any);
    return count > 0;
  }
}
