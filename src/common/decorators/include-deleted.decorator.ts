import { SetMetadata } from '@nestjs/common';

export const INCLUDE_DELETED_KEY = 'include_deleted';

/**
 * Decorator to include soft-deleted records in repository queries
 * Can be applied at controller or method level
 *
 * When this decorator is used, the BaseRepository will NOT filter out
 * soft-deleted records (where deletedAt is not null)
 *
 * @example
 * ```typescript
 * // At method level - only this method includes deleted records
 * @Get('archive')
 * @IncludeDeleted()
 * async getArchive() {
 *   return this.service.findAll(); // Includes soft-deleted records
 * }
 *
 * // At controller level - all methods in this controller include deleted records
 * @Controller('admin/audit')
 * @IncludeDeleted()
 * export class AuditController {
 *   @Get()
 *   async getAll() {
 *     return this.service.findAll(); // Includes soft-deleted records
 *   }
 *
 *   @Get(':id')
 *   async getOne(@Param('id') id: string) {
 *     return this.service.findOne(id); // Includes soft-deleted records
 *   }
 * }
 * ```
 *
 * @note Method-level decorator takes precedence over controller-level
 * @note This bypasses the automatic soft-delete filter in BaseRepository
 */
export const IncludeDeleted = () => SetMetadata(INCLUDE_DELETED_KEY, true);
