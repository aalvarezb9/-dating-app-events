import { IsOptional, IsInt, Min, Max, IsString } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Base filterable query with pagination and sorting
 *
 * Extend this class to add custom filters for your entity
 *
 * @example
 * ```typescript
 * export class QueryReviewDto extends FilterableQueryDto {
 *   @ApiPropertyOptional()
 *   @IsOptional()
 *   @IsNumber()
 *   @Min(1)
 *   @Max(5)
 *   minRating?: number;
 *
 *   @ApiPropertyOptional()
 *   @IsOptional()
 *   @IsBoolean()
 *   isPublic?: boolean;
 * }
 * ```
 */
export class FilterableQueryDto {
  @ApiPropertyOptional({
    description: 'Page number (1-based)',
    minimum: 1,
    default: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({
    description: 'Number of items per page',
    minimum: 1,
    maximum: 100,
    default: 10,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 10;

  @ApiPropertyOptional({
    description: 'Field to sort by',
    example: 'createdAt',
  })
  @IsOptional()
  @IsString()
  sortBy?: string;

  @ApiPropertyOptional({
    description: 'Sort order',
    enum: ['ASC', 'DESC'],
    default: 'DESC',
  })
  @IsOptional()
  @IsString()
  sortOrder?: 'ASC' | 'DESC' = 'DESC';

  get skip(): number {
    return ((this.page || 1) - 1) * (this.limit || 10);
  }
}

/**
 * Filter configuration for dynamic TypeORM queries
 *
 * Supports:
 * - Equality: { status: 'PENDING' }
 * - Comparison: { rating: { $gte: 4 } }
 * - Range: { createdAt: { $between: [startDate, endDate] } }
 */
export type FilterOperator =
  | { $eq: any }          // Equal
  | { $ne: any }          // Not equal
  | { $gt: any }          // Greater than
  | { $gte: any }         // Greater than or equal
  | { $lt: any }          // Less than
  | { $lte: any }         // Less than or equal
  | { $between: [any, any] }  // Between two values
  | { $in: any[] }        // In array
  | { $notIn: any[] }     // Not in array
  | { $like: string }     // Like (SQL pattern matching)
  | { $ilike: string };   // Case-insensitive like

export type FilterValue = any | FilterOperator;

export interface DynamicFilters {
  [key: string]: FilterValue;
}
