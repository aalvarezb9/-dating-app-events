# BaseRepository Examples

This directory contains usage examples for the BaseRepository system.

## Overview

The BaseRepository system provides a database-agnostic repository pattern with automatic event emission for CRUD operations. It supports multiple database types through adapters.

## Features

- **Database Agnostic**: Works with PostgreSQL, DynamoDB, Redis, MongoDB, etc. through adapters
- **Automatic Event Emission**: Emit SNS events on create, update, delete, soft-delete, and restore operations
- **Event Filtering**: Conditionally emit events based on entity data
- **Soft Delete Support**: Optional soft delete functionality with configurable field names
- **Custom Event Data**: Extract specific data for events using custom extractors
- **Multi-tenancy Support**: Built-in tenant_id and user_id field support

## Available Adapters

- **PostgresAdapter**: TypeORM adapter for PostgreSQL databases
- **DynamoDBAdapter**: AWS SDK adapter for DynamoDB tables

## Usage Example

See `UserRepository.example.ts` for a complete example showing:

1. How to extend BaseRepository
2. Configure PostgreSQL adapter with TypeORM
3. Enable soft delete
4. Configure event emission on create and update
5. Apply event filters (only emit for admin users or create operations)
6. Extract custom event data
7. Add custom repository methods

## Basic Setup

```typescript
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  BaseRepository,
  PostgresAdapter,
  EventPublisher,
  DomainEventType
} from '@dating-app/events';

@Injectable()
export class MyRepository extends BaseRepository<MyEntity> {
  constructor(
    @InjectRepository(MyEntity)
    private readonly typeormRepo: Repository<MyEntity>,
    private readonly eventPublisher: EventPublisher,
  ) {
    // Create adapter
    const adapter = new PostgresAdapter(typeormRepo, {
      softDeleteField: 'deleted_at',
      idField: 'id',
    });

    // Configure BaseRepository
    super(adapter, eventPublisher, {
      entityName: 'MyEntity',
      enableSoftDelete: true,
      events: {
        publishOnCreate: true,
        publishOnUpdate: true,
        eventTypeOnCreate: DomainEventType.MY_ENTITY_CREATED,
        eventTypeOnUpdate: DomainEventType.MY_ENTITY_UPDATED,
      },
    });
  }
}
```

## Configuration Options

### BaseRepositoryConfig

- **entityName**: Name of the entity (for logging and events)
- **enableSoftDelete**: Enable soft delete support (default: false)
- **softDeleteField**: Field name for soft delete timestamp (default: 'deleted_at')
- **idField**: Primary key field name (default: 'id')
- **tenantIdField**: Tenant ID field name (default: 'tenant_id')
- **userIdField**: User ID field name (default: 'user_id')

### Event Configuration

- **publishOnCreate**: Emit event when creating entities
- **publishOnUpdate**: Emit event when updating entities
- **publishOnDelete**: Emit event when permanently deleting entities
- **publishOnSoftDelete**: Emit event when soft deleting entities
- **publishOnRestore**: Emit event when restoring soft-deleted entities
- **eventTypeOnCreate**: Event type for create operations
- **eventTypeOnUpdate**: Event type for update operations
- **eventTypeOnDelete**: Event type for delete operations
- **eventTypeOnSoftDelete**: Event type for soft delete operations
- **eventTypeOnRestore**: Event type for restore operations
- **eventFilter**: Function to conditionally emit events based on entity data
- **eventDataExtractor**: Function to extract custom event data from entities
- **eventMetadata**: Additional metadata to include in all events

## Event Filtering Example

```typescript
events: {
  publishOnCreate: true,
  publishOnUpdate: true,

  // Only emit events for admin users or all create operations
  eventFilter: (entity, operation) => {
    if (entity.role === 'ADMIN') return true;
    if (operation === 'create') return true;
    return false;
  },

  // Extract specific data for events
  eventDataExtractor: (entity, operation) => ({
    userId: entity.id,
    email: entity.email,
    fullName: `${entity.firstName} ${entity.lastName}`,
    role: entity.role,
    operation,
  }),
}
```

## DynamoDB Example

```typescript
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { DynamoDBAdapter } from '@dating-app/events';

const client = new DynamoDBClient({ region: 'us-east-1' });
const docClient = DynamoDBDocumentClient.from(client);

const adapter = new DynamoDBAdapter(docClient, {
  tableName: 'Products',
  partitionKey: 'productId',
  sortKey: 'tenantId', // optional
  softDeleteField: 'deleted_at',
});

const repo = new BaseRepository(adapter, eventPublisher, {
  entityName: 'Product',
  events: {
    publishOnCreate: true,
    publishOnUpdate: true,
    eventFilter: (product) => product.price > 100, // Only emit for expensive products
  },
});
```

## Available Methods

All repositories extending BaseRepository have access to these methods:

- `create(entity: Partial<Entity>): Promise<Entity>`
- `createMany(entities: Partial<Entity>[]): Promise<Entity[]>`
- `update(id: string, partialEntity: Partial<Entity>): Promise<Entity>`
- `findOne(criteria: FindCriteria): Promise<Entity | null>`
- `findMany(criteria?: FindCriteria, options?: FindOptions): Promise<Entity[]>`
- `findById(id: string): Promise<Entity | null>`
- `delete(id: string): Promise<void>`
- `softDelete(id: string): Promise<void>` (if enabled)
- `restore(id: string): Promise<void>` (if enabled)
- `count(criteria?: FindCriteria): Promise<number>`
- `exists(criteria: FindCriteria): Promise<boolean>`

## Custom Methods

You can add custom methods to your repository:

```typescript
export class UserRepository extends BaseRepository<User> {
  // ... constructor ...

  async findActiveUsersByRole(role: string): Promise<User[]> {
    return this.findMany({
      role,
      is_active: true,
      deleted_at: null,
    });
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.findOne({ email });
  }
}
```
