import { Injectable } from '@nestjs/common';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { BaseRepository } from '../base/BaseRepository';
import { PostgresAdapter } from '../adapters/PostgresAdapter';
import { EventPublisher } from '../../services/event-publisher.service';
import { DomainEventType } from '../../types/events';

/**
 * Example User entity (TypeORM)
 */
class User {
  id: string;
  tenant_id: string;
  email: string;
  first_name: string;
  last_name: string;
  role: string;
  is_active: boolean;
  deleted_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

/**
 * Example UserRepository using BaseRepository with PostgreSQL
 *
 * This example shows:
 * - Soft delete enabled
 * - Event emission on create, update, and soft delete
 * - Custom event filter (only emit for admin users)
 * - Custom event data extractor
 */
@Injectable()
export class UserRepository extends BaseRepository<User> {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly eventPublisher: EventPublisher,
  ) {
    // Create PostgreSQL adapter
    const adapter = new PostgresAdapter(userRepository, {
      softDeleteField: 'deleted_at',
      idField: 'id',
    });

    // Configure BaseRepository
    super(adapter, eventPublisher, {
      entityName: 'User',
      enableSoftDelete: true,
      softDeleteField: 'deleted_at',
      idField: 'id',
      tenantIdField: 'tenant_id',
      events: {
        // Enable event publishing
        publishOnCreate: true,
        publishOnUpdate: true,
        publishOnSoftDelete: true,

        // Event types
        eventTypeOnCreate: DomainEventType.USER_REGISTERED,
        eventTypeOnUpdate: DomainEventType.USER_UPDATED,
        eventTypeOnSoftDelete: DomainEventType.USER_DELETED,

        // Custom filter: only emit events for admin users
        eventFilter: (user, operation) => {
          // Example: only emit events for admin users
          if (user.role === 'ADMIN') {
            return true;
          }

          // Or emit all create events regardless of role
          if (operation === 'create') {
            return true;
          }

          return false;
        },

        // Extract specific data for events
        eventDataExtractor: (user, operation) => ({
          userId: user.id,
          email: user.email,
          fullName: `${user.first_name} ${user.last_name}`,
          role: user.role,
          isActive: user.is_active,
          operation,
        }),

        // Add custom metadata
        eventMetadata: {
          service: 'user-service',
          version: '1.0.0',
        },
      },
    });
  }

  /**
   * Custom method: Find active users by role
   */
  async findActiveUsersByRole(role: string): Promise<User[]> {
    return this.findMany({
      role,
      is_active: true,
      deleted_at: null,
    });
  }

  /**
   * Custom method: Find user by email
   */
  async findByEmail(email: string): Promise<User | null> {
    return this.findOne({ email });
  }
}

/**
 * Example usage in a service:
 *
 * ```typescript
 * @Injectable()
 * export class UserService {
 *   constructor(private readonly userRepository: UserRepository) {}
 *
 *   async createUser(data: CreateUserDto) {
 *     // This will automatically emit USER_REGISTERED event if user is admin
 *     const user = await this.userRepository.create({
 *       email: data.email,
 *       first_name: data.firstName,
 *       last_name: data.lastName,
 *       role: data.role,
 *       tenant_id: data.tenantId,
 *       is_active: true,
 *     });
 *
 *     return user;
 *   }
 *
 *   async updateUser(id: string, data: UpdateUserDto) {
 *     // This will automatically emit USER_UPDATED event if user is admin
 *     return await this.userRepository.update(id, data);
 *   }
 *
 *   async deleteUser(id: string) {
 *     // Soft delete - will emit USER_DELETED event
 *     await this.userRepository.softDelete(id);
 *   }
 *
 *   async restoreUser(id: string) {
 *     // Restore soft-deleted user
 *     await this.userRepository.restore(id);
 *   }
 * }
 * ```
 */
