import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { redactSensitive } from '../utils/redact';

const MAX_LOGGED_BODY_LENGTH = 2000;

/**
 * Interceptor to log all incoming requests and their response time.
 *
 * Request bodies are logged only after masking credentials, tokens and banking /
 * identity fields (see redactSensitive), and truncated.
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const { method, url, body, user } = request;
    const userEmail = user?.email || 'anonymous';
    const now = Date.now();

    let loggedBody = JSON.stringify(redactSensitive(body)) ?? '';
    if (loggedBody.length > MAX_LOGGED_BODY_LENGTH) {
      loggedBody = `${loggedBody.slice(0, MAX_LOGGED_BODY_LENGTH)}…[truncated]`;
    }

    this.logger.log(
      `→ ${method} ${url} | User: ${userEmail} | Body: ${loggedBody}`,
    );

    return next.handle().pipe(
      tap({
        next: () => {
          const responseTime = Date.now() - now;
          this.logger.log(
            `← ${method} ${url} | User: ${userEmail} | ${responseTime}ms`,
          );
        },
        error: (error) => {
          const responseTime = Date.now() - now;
          this.logger.error(
            `← ${method} ${url} | User: ${userEmail} | ${responseTime}ms | Error: ${error?.message}`,
          );
        },
      }),
    );
  }
}
