import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';

/**
 * Interceptor that ensures tenant context is available in the request
 * This is used for implementing Row Level Security (RLS) at application level
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
