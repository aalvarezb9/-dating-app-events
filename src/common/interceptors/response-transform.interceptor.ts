import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Type,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { plainToInstance, ClassConstructor } from 'class-transformer';
import { DTO_KEY } from '../decorators/use-dto.decorator';
import { ApiResponse } from '../interfaces/api-response.interface';

/**
 * Global interceptor that transforms all responses to a standard ApiResponse format
 *
 * Features:
 * - Wraps all responses in { success, data, timestamp }
 * - Automatically transforms data to DTO if @UseDto decorator is used
 * - Supports paginated responses
 * - Excludes extraneous values using class-transformer
 */
@Injectable()
export class ResponseTransformInterceptor<T>
  implements NestInterceptor<T, ApiResponse<T>>
{
  constructor(private readonly reflector: Reflector) {}

  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<ApiResponse<T>> {
    const dtoClass = this.reflector.get<ClassConstructor<any>>(DTO_KEY, context.getHandler());

    return next.handle().pipe(
      map((data) => {
        let transformedData = data;

        // 1. Apply DTO transformation if @UseDto decorator is present
        if (dtoClass && data) {
          // Check if response is paginated (has items array)
          if (data && typeof data === 'object' && Array.isArray(data.items)) {
            // Paginated response - transform only the items array
            transformedData = {
              ...data,
              items: plainToInstance(dtoClass, data.items, {
                excludeExtraneousValues: true,
              }),
            };
          } else if (data && typeof data === 'object' && Array.isArray(data.data)) {
            // PaginatedResult structure: { data: T[], meta: {...} }
            transformedData = {
              ...data,
              data: plainToInstance(dtoClass, data.data, {
                excludeExtraneousValues: true,
              }),
            };
          } else if (Array.isArray(data)) {
            // Array response - transform each item
            transformedData = plainToInstance(dtoClass, data, {
              excludeExtraneousValues: true,
            });
          } else {
            // Single object response - transform the whole object
            transformedData = plainToInstance(dtoClass, data, {
              excludeExtraneousValues: true,
            });
          }
        }

        // 2. Wrap in standard ApiResponse format
        return {
          success: true,
          data: transformedData,
          timestamp: new Date().toISOString(),
        };
      }),
    );
  }
}
