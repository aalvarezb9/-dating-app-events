import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';

/**
 * @deprecated Use ExecutionContextInterceptor instead
 *
 * Interceptor that ensures tenant context is available in the request
 * This is used for implementing Row Level Security (RLS) at application level
 *
 * NOTE: This interceptor is now deprecated. Use ExecutionContextInterceptor
 * instead, which provides the same functionality plus additional context
 * (userId, requestId, etc.) using AsyncLocalStorage.
 *
 * Migration:
 * ```typescript
 * // Before
 * import { TenantInterceptor } from '@dating-app/events';
 * app.useGlobalInterceptors(new TenantInterceptor());
 *
 * // After
 * import { ExecutionContextInterceptor } from '@dating-app/events';
 * app.useGlobalInterceptors(new ExecutionContextInterceptor());
 * ```
 */
@Injectable()
export class TenantInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (user && user.tenantId) {
      // Add tenant context to request for use in services/repositories
      request.tenantId = user.tenantId;
    }

    return next.handle();
  }
}
