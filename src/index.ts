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
export * from './repositories/adapters/DynamoDBAdapter';

// Decorators
export * from './decorators/emitable.decorator';

// Modules
export * from './events.module';

// Common Module (decorators, guards, interceptors, filters, DTOs, pipes)
export * from './common';
