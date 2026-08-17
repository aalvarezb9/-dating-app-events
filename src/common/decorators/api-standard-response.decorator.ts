import { applyDecorators, Type } from '@nestjs/common';
import { ApiExtraModels, ApiResponse, getSchemaPath } from '@nestjs/swagger';

/**
 * Custom Swagger decorator for standardized API responses
 *
 * Wraps responses in the standard format:
 * {
 *   success: true,
 *   data: T | T[] | PaginatedResult<T>,
 *   timestamp: "2024-01-01T00:00:00.000Z"
 * }
 *
 * @param dataDto - The DTO class for the response data
 * @param options - Response configuration
 */
export function ApiStandardResponse<TModel extends Type<any>>(
  dataDto: TModel,
  options?: {
    status?: number;
    description?: string;
    isArray?: boolean;
    isPaginated?: boolean;
  },
) {
  const status = options?.status ?? 200;
  const description = options?.description ?? 'Success';
  const isArray = options?.isArray ?? false;
  const isPaginated = options?.isPaginated ?? false;

  // Schema for paginated response
  const paginatedSchema = {
    type: 'object',
    properties: {
      success: { type: 'boolean', example: true },
      data: {
        type: 'object',
        properties: {
          data: {
            type: 'array',
            items: { $ref: getSchemaPath(dataDto) },
          },
          meta: {
            type: 'object',
            properties: {
              total: { type: 'number', example: 100 },
              page: { type: 'number', example: 1 },
              limit: { type: 'number', example: 10 },
              totalPages: { type: 'number', example: 10 },
              hasNextPage: { type: 'boolean', example: true },
              hasPreviousPage: { type: 'boolean', example: false },
              currentPage: { type: 'number', example: 1 },
              nextPage: { type: 'number', example: 2, nullable: true },
            },
          },
        },
      },
      timestamp: { type: 'string', format: 'date-time', example: '2024-01-01T00:00:00.000Z' },
    },
  };

  // Schema for array response
  const arraySchema = {
    type: 'object',
    properties: {
      success: { type: 'boolean', example: true },
      data: {
        type: 'array',
        items: { $ref: getSchemaPath(dataDto) },
      },
      timestamp: { type: 'string', format: 'date-time', example: '2024-01-01T00:00:00.000Z' },
    },
  };

  // Schema for single object response
  const singleSchema = {
    type: 'object',
    properties: {
      success: { type: 'boolean', example: true },
      data: { $ref: getSchemaPath(dataDto) },
      timestamp: { type: 'string', format: 'date-time', example: '2024-01-01T00:00:00.000Z' },
    },
  };

  // Select appropriate schema
  const schema = isPaginated ? paginatedSchema : isArray ? arraySchema : singleSchema;

  return applyDecorators(
    ApiExtraModels(dataDto),
    ApiResponse({
      status,
      description,
      schema,
    }),
  );
}
