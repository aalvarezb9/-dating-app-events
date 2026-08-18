import { SetMetadata } from '@nestjs/common';

/**
 * Metadata key for cross-tenant decorator
 */
export const CROSS_TENANT_KEY = 'isCrossTenant';

/**
 * CrossTenant Decorator
 *
 * Marks an endpoint or class to bypass tenant filtering in repositories.
 * Use this decorator when you need to query data across all tenants.
 *
 * **Use Cases:**
 * - Public endpoints that need to check global uniqueness (e.g., subdomain availability)
 * - Admin endpoints that operate on all tenants
 * - Scheduled jobs/cron tasks that process data from multiple tenants
 * - Services that aggregate data across tenants
 *
 * **Can be applied to:**
 * - Controller methods (endpoint-level)
 * - Controller classes (all endpoints in controller)
 * - Service classes (all methods in service - for cron jobs, background tasks)
 *
 * @example Controller method (endpoint-specific)
 * ```typescript
 * @Get('check/:name')
 * @Public()
 * @CrossTenant()
 * async checkSubdomainAvailability(@Param('name') name: string) {
 *   return this.service.checkAvailability(name);
 *   // Repository queries will NOT filter by tenant
 * }
 * ```
 *
 * @example Controller class (all endpoints)
 * ```typescript
 * @Controller('admin/tenants')
 * @Roles(UserRole.SUPER_ADMIN)
 * @CrossTenant()  // All endpoints in this controller bypass tenant filter
 * export class AdminTenantController {
 *   @Get()
 *   async getAllTenants() {
 *     return this.service.findAll(); // Returns ALL tenants
 *   }
 * }
 * ```
 *
 * @example Service class (for cron jobs)
 * ```typescript
 * @Injectable()
 * @CrossTenant()  // All methods in this service bypass tenant filter
 * export class TenantSyncService {
 *   @Cron('0 0 * * *')
 *   async syncAllTenants() {
 *     const allTenants = await this.repository.findAll();
 *     // Process all tenants...
 *   }
 * }
 * ```
 *
 * **Security Note:**
 * Only use this decorator when you explicitly need cross-tenant access.
 * Ensure proper authorization is in place (e.g., @Roles(UserRole.SUPER_ADMIN))
 * for endpoints that access data from multiple tenants.
 */
export const CrossTenant = () => SetMetadata(CROSS_TENANT_KEY, true);
