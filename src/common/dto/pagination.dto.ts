import { IsOptional, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class PaginationDto {
  @ApiPropertyOptional({
    description: 'Page number (1-based)',
    minimum: 1,
    default: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

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
  limit: number = 10;

  get skip(): number {
    return (this.page - 1) * this.limit;
  }
}

/**
 * Interface for pagination query parameters
 */
export interface PaginationQuery {
  page?: number;
  limit?: number;
  skip?: number;
  sortBy?: string;
  sortOrder?: 'ASC' | 'DESC';
}

export interface PaginatedResult<T> {
  data: T[];
  meta: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
    currentPage: number;
    nextPage: number | null;
  };
}

export function createPaginatedResult<T>(
  data: T[],
  total: number,
  pagination: PaginationDto,
): PaginatedResult<T> {
  const totalPages = Math.ceil(total / pagination.limit);
  const hasNextPage = pagination.page < totalPages;

  return {
    data,
    meta: {
      page: pagination.page,
      limit: pagination.limit,
      total,
      totalPages,
      hasNextPage,
      hasPreviousPage: pagination.page > 1,
      currentPage: pagination.page,
      nextPage: hasNextPage ? pagination.page + 1 : null,
    },
  };
}
