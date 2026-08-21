/**
 * @dating-app/events
 * Event-driven architecture library for Dating App microservices
 */

// Types and Enums
export * from './types/events';

// Services
export * from './services/event-publisher.service';

// Repositories
export * from './repositories/event-emitting.repository';

// Base Repository System
export * from './repositories/base/BaseRepository';
export * from './repositories/base/IDatabaseAdapter';
export * from './repositories/base/BaseRepositoryConfig';
export type { EntityMappers } from './repositories/base/BaseRepositoryConfig';

// Database Adapters
export * from './repositories/adapters/PostgresAdapter';
// DynamoDB adapter requires @aws-sdk/lib-dynamodb - only export if needed
// export * from './repositories/adapters/DynamoDBAdapter';

// Decorators
export * from './decorators/emitable.decorator';

// Modules
export * from './events.module';

// Configuration
export * from './config/env.config';
export * from './config/shared-config.module';

// Storage
export * from './storage';

// Auth
export * from './auth';

// Cache
export * from './cache/redis-cache.module';

// Common Module (decorators, guards, interceptors, filters, DTOs, pipes)
export * from './common';


// Database Utilities
export * from './database/transaction-manager';
export * from './database/advisory-lock-manager';

// Encryption
export * from './encryption/encryption.service';
export * from './encryption/encryption.module';
