import {
  Injectable,
  NestInterceptor,
  ExecutionContext as NestExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { ExecutionContext } from '../context/execution-context.service';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { INCLUDE_DELETED_KEY } from '../decorators/include-deleted.decorator';
import { CROSS_TENANT_KEY } from '../decorators/cross-tenant.decorator';
import { randomUUID } from 'crypto';

/**
 * Execution Context Interceptor
 *
 * Captures request data and stores it in ExecutionContext for access
 * throughout the entire request lifecycle.
 *
 * This interceptor should be registered globally in main.ts or app.module.ts:
 *
 * @example In main.ts
 * ```typescript
 * import { ExecutionContextInterceptor } from '@dating-app/events';
 *
 * async function bootstrap() {
 *   const app = await NestFactory.create(AppModule);
 *   app.useGlobalInterceptors(new ExecutionContextInterceptor());
 *   await app.listen(3000);
 * }
 * ```
 *
 * @example In app.module.ts
 * ```typescript
 * import { ExecutionContextInterceptor } from '@dating-app/events';
 *
 * @Module({
 *   providers: [
 *     {
 *       provide: APP_INTERCEPTOR,
 *       useClass: ExecutionContextInterceptor,
 *     },
 *   ],
 * })
 * export class AppModule {}
 * ```
 */
@Injectable()
export class ExecutionContextInterceptor implements NestInterceptor {
  constructor(private reflector: Reflector) {}

  intercept(context: NestExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    // Read @Public() metadata from the endpoint
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // Read @CrossTenant() metadata from the endpoint or class
    const isCrossTenant = this.reflector.getAllAndOverride<boolean>(CROSS_TENANT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // Check if @IncludeDeleted decorator is present (method level overrides class level)
    const includeDeleted = this.reflector.getAllAndOverride<boolean>(INCLUDE_DELETED_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // Build context data from request
    const contextData = {
      requestId: request.id || randomUUID(),
      tenantId: user?.tenantId || request.tenantId,
      userId: user?.id || user?.userId,
      userEmail: user?.email,
      userRoles: user?.roles,
      isPublic: isPublic || false,
      isCrossTenant: isCrossTenant || false,
      includeDeleted: includeDeleted || false,
    };

    // Run the rest of the request within this context
    return new Observable((subscriber) => {
      ExecutionContext.run(contextData, () => {
        next.handle().subscribe({
          next: (value) => subscriber.next(value),
          error: (error) => subscriber.error(error),
          complete: () => subscriber.complete(),
        });
      });
    });
  }
}
