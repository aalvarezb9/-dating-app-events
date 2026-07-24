import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  PutCommand,
  GetCommand,
  UpdateCommand,
  DeleteCommand,
  QueryCommand,
  ScanCommand,
} from '@aws-sdk/lib-dynamodb';
import { IDatabaseAdapter, FindCriteria, FindOptions } from '../base/IDatabaseAdapter';

/**
 * DynamoDB adapter for BaseRepository
 *
 * @example
 * ```typescript
 * const client = new DynamoDBClient({ region: 'us-east-1' });
 * const docClient = DynamoDBDocumentClient.from(client);
 *
 * const adapter = new DynamoDBAdapter(docClient, {
 *   tableName: 'Users',
 *   partitionKey: 'userId',
 *   sortKey: 'tenantId', // optional
 *   softDeleteField: 'deleted_at',
 * });
 * ```
 */
export class DynamoDBAdapter<Entity = any> implements IDatabaseAdapter<Entity> {
  constructor(
    private readonly docClient: DynamoDBDocumentClient,
    private readonly options: {
      tableName: string;
      partitionKey: string;
      sortKey?: string;
      softDeleteField?: string;
      idField?: string;
    },
  ) {
    this.options.softDeleteField = this.options.softDeleteField || 'deleted_at';
    this.options.idField = this.options.idField || 'id';
  }

  async create(entity: Partial<Entity>): Promise<Entity> {
    const item = {
      ...entity,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as Entity;

    await this.docClient.send(
      new PutCommand({
        TableName: this.options.tableName,
        Item: item as Record<string, any>,
      }),
    );

    return item;
  }

  async createMany(entities: Partial<Entity>[]): Promise<Entity[]> {
    // DynamoDB doesn't have batch write with return values
    // We'll do individual puts
    const results: Entity[] = [];

    for (const entity of entities) {
      const result = await this.create(entity);
      results.push(result);
    }

    return results;
  }

  async update(id: string, partialEntity: Partial<Entity>): Promise<Entity> {
    const updateExpression: string[] = [];
    const expressionAttributeNames: Record<string, string> = {};
    const expressionAttributeValues: Record<string, any> = {};

    let index = 0;
    for (const [key, value] of Object.entries(partialEntity)) {
      if (key === this.options.partitionKey || key === this.options.sortKey) {
        continue; // Skip key attributes
      }

      const nameKey = `#attr${index}`;
      const valueKey = `:val${index}`;

      updateExpression.push(`${nameKey} = ${valueKey}`);
      expressionAttributeNames[nameKey] = key;
      expressionAttributeValues[valueKey] = value;

      index++;
    }

    // Add updated_at
    updateExpression.push(`#updated_at = :updated_at`);
    expressionAttributeNames['#updated_at'] = 'updated_at';
    expressionAttributeValues[':updated_at'] = new Date().toISOString();

    const keyCondition: Record<string, any> = {
      [this.options.partitionKey]: id,
    };

    await this.docClient.send(
      new UpdateCommand({
        TableName: this.options.tableName,
        Key: keyCondition,
        UpdateExpression: `SET ${updateExpression.join(', ')}`,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
        ReturnValues: 'ALL_NEW',
      }),
    );

    // Fetch and return updated entity
    return (await this.findById(id))!;
  }

  async findOne(criteria: FindCriteria): Promise<Entity | null> {
    // Check if we have partition key
    if (criteria[this.options.partitionKey]) {
      const keyCondition: Record<string, any> = {
        [this.options.partitionKey]: criteria[this.options.partitionKey],
      };

      if (this.options.sortKey && criteria[this.options.sortKey]) {
        keyCondition[this.options.sortKey] = criteria[this.options.sortKey];
      }

      const result = await this.docClient.send(
        new GetCommand({
          TableName: this.options.tableName,
          Key: keyCondition,
        }),
      );

      return (result.Item as Entity) || null;
    }

    // Fallback to scan (not recommended for production)
    const results = await this.findMany(criteria, { limit: 1 });
    return results[0] || null;
  }

  async findMany(criteria: FindCriteria, options?: FindOptions): Promise<Entity[]> {
    // If we have partition key, use Query (efficient)
    if (criteria[this.options.partitionKey]) {
      return await this.queryWithCriteria(criteria, options);
    }

    // Otherwise, use Scan (expensive - avoid in production)
    return await this.scanWithCriteria(criteria, options);
  }

  async findById(id: string): Promise<Entity | null> {
    return await this.findOne({ [this.options.partitionKey]: id });
  }

  async delete(id: string): Promise<void> {
    const keyCondition: Record<string, any> = {
      [this.options.partitionKey]: id,
    };

    await this.docClient.send(
      new DeleteCommand({
        TableName: this.options.tableName,
        Key: keyCondition,
      }),
    );
  }

  async softDelete(id: string): Promise<void> {
    await this.update(id, {
      [this.options.softDeleteField!]: new Date().toISOString(),
    } as any);
  }

  async restore(id: string): Promise<void> {
    await this.update(id, {
      [this.options.softDeleteField!]: null,
    } as any);
  }

  async count(criteria?: FindCriteria): Promise<number> {
    const results = await this.findMany(criteria || {});
    return results.length;
  }

  async exists(criteria: FindCriteria): Promise<boolean> {
    const result = await this.findOne(criteria);
    return result !== null;
  }

  private async queryWithCriteria(
    criteria: FindCriteria,
    options?: FindOptions,
  ): Promise<Entity[]> {
    const keyConditionExpression: string[] = [];
    const expressionAttributeNames: Record<string, string> = {};
    const expressionAttributeValues: Record<string, any> = {};

    // Partition key
    keyConditionExpression.push(`#pk = :pk`);
    expressionAttributeNames['#pk'] = this.options.partitionKey;
    expressionAttributeValues[':pk'] = criteria[this.options.partitionKey];

    // Sort key (if exists)
    if (this.options.sortKey && criteria[this.options.sortKey]) {
      keyConditionExpression.push(`#sk = :sk`);
      expressionAttributeNames['#sk'] = this.options.sortKey;
      expressionAttributeValues[':sk'] = criteria[this.options.sortKey];
    }

    const result = await this.docClient.send(
      new QueryCommand({
        TableName: this.options.tableName,
        KeyConditionExpression: keyConditionExpression.join(' AND '),
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
        Limit: options?.limit,
      }),
    );

    return (result.Items as Entity[]) || [];
  }

  private async scanWithCriteria(
    criteria: FindCriteria,
    options?: FindOptions,
  ): Promise<Entity[]> {
    const result = await this.docClient.send(
      new ScanCommand({
        TableName: this.options.tableName,
        Limit: options?.limit,
      }),
    );

    let items = (result.Items as Entity[]) || [];

    // Filter manually (not ideal, but DynamoDB scan is already expensive)
    if (Object.keys(criteria).length > 0) {
      items = items.filter((item: any) => {
        return Object.entries(criteria).every(([key, value]) => item[key] === value);
      });
    }

    return items;
  }
}
