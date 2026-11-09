import { Logger, OnModuleInit } from '@nestjs/common';
import { DataSource, EntityTarget } from 'typeorm';

/** A column that is searched by the start of its text */
export interface PrefixIndexedColumn {
  /** The column in the database (snake_case) */
  column: string;
  /**
   * Index `lower(column)` (default). Pass `false` for a column that is already stored in lowercase
   * (a subdomain): the index is then on the column itself.
   */
  lowercase?: boolean;
}

const IDENTIFIER = /^[a-z_][a-z0-9_]*$/;

/**
 * Creates, at startup and idempotently, the btree indexes that make a prefix search (`searchPrefixPattern`) a walk of
 * an index and not a read of the table: `CREATE INDEX … ON table (lower(column) text_pattern_ops)`. TypeORM cannot
 * declare an expression index with an operator class, so they are created here. When a service has migrations this
 * SQL belongs in one of them.
 *
 * Extend it in the service, name the entity and the columns, and register the class as a provider:
 *
 * ```typescript
 * @Injectable()
 * export class SearchIndexesService extends PrefixSearchIndexes {
 *   protected readonly entity = User;
 *   protected readonly columns = [{ column: 'email' }, { column: 'first_name' }];
 * }
 * ```
 */
export abstract class PrefixSearchIndexes implements OnModuleInit {
  protected readonly logger = new Logger(this.constructor.name);

  protected abstract readonly entity: EntityTarget<unknown>;
  protected abstract readonly columns: readonly PrefixIndexedColumn[];

  constructor(protected readonly dataSource: DataSource) {}

  async onModuleInit(): Promise<void> {
    const table = this.dataSource.getMetadata(this.entity).tableName;

    for (const { column, lowercase = true } of this.columns) {
      if (!IDENTIFIER.test(table) || !IDENTIFIER.test(column)) {
        throw new Error(`Not a safe identifier for an index: ${table}.${column}`);
      }
      const expression = lowercase ? `lower(${column})` : column;
      await this.dataSource.query(`CREATE INDEX IF NOT EXISTS ${table}_${column}_prefix_idx ON ${table} (${expression} text_pattern_ops)`);
    }
    this.logger.log(`Prefix search indexes ready on ${table}`);
  }
}
