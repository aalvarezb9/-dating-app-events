import { SetMetadata } from '@nestjs/common';

/**
 * Metadata key for DTO class
 */
export const DTO_KEY = 'dto_class';

/**
 * Decorator to specify which DTO class should be used for response transformation
 *
 * @param dtoClass - The DTO class to transform the response to
 *
 * @example
 * ```typescript
 * @Get()
 * @UseDto(SubdomainResponseDto)
 * async getSubdomain(@CurrentTenant() tenantId: string) {
 *   return this.subdomainService.findByTenantId(tenantId);
 * }
 * ```
 */
export const UseDto = (dtoClass: any) => SetMetadata(DTO_KEY, dtoClass);
