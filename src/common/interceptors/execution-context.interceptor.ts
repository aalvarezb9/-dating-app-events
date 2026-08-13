import {
  Injectable,
  NestInterceptor,
  ExecutionContext as NestExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { ExecutionContext } from '../context/execution-context.service';
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
  intercept(context: NestExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    // Build context data from request
    const contextData = {
      requestId: request.id || randomUUID(),
      tenantId: user?.tenantId || request.tenantId,
      userId: user?.id || user?.userId,
      userEmail: user?.email,
      userRoles: user?.roles,
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
