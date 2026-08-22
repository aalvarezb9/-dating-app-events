import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import sanitizeHtml, { IOptions } from 'sanitize-html';

/**
 * Global interceptor to sanitize all incoming request data
 *
 * Automatically removes HTML tags and potential XSS vectors from:
 * - request.body
 * - request.query
 * - request.params
 *
 * Works recursively on objects and arrays.
 *
 * @example
 * // Register globally in app.module.ts
 * {
 *   provide: APP_INTERCEPTOR,
 *   useClass: SanitizeInterceptor,
 * }
 */
@Injectable()
export class SanitizeInterceptor implements NestInterceptor {
  private readonly logger = new Logger(SanitizeInterceptor.name);

  // Sanitization config: Strip ALL HTML tags and attributes
  private readonly sanitizeConfig: IOptions = {
    allowedTags: [], // Remove ALL HTML tags
    allowedAttributes: {}, // Remove ALL attributes
    disallowedTagsMode: 'discard', // Remove tags completely
  };

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();

    // Sanitize all incoming data sources (mutate in place, don't reassign)
    if (request.body && typeof request.body === 'object') {
      this.sanitizeObjectInPlace(request.body);
    }

    if (request.query && typeof request.query === 'object') {
      this.sanitizeObjectInPlace(request.query);
    }

    if (request.params && typeof request.params === 'object') {
      this.sanitizeObjectInPlace(request.params);
    }

    return next.handle();
  }

  /**
   * Recursively sanitize an object IN PLACE (mutate, don't create new object)
   * This is necessary because request.query and request.params are read-only getters
   */
  private sanitizeObjectInPlace(obj: any): void {
    if (!obj || typeof obj !== 'object') {
      return;
    }

    // Handle arrays - sanitize each item in place
    if (Array.isArray(obj)) {
      for (let i = 0; i < obj.length; i++) {
        if (typeof obj[i] === 'string') {
          obj[i] = this.sanitizeString(obj[i]);
        } else if (typeof obj[i] === 'object' && obj[i] !== null) {
          this.sanitizeObjectInPlace(obj[i]);
        }
      }
      return;
    }

    // Handle objects - sanitize each property in place
    for (const key in obj) {
      // Use Object.prototype.hasOwnProperty.call() to handle objects without hasOwnProperty
      // (e.g., request.query which may have null prototype)
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        const value = obj[key];

        if (typeof value === 'string') {
          obj[key] = this.sanitizeString(value);
        } else if (typeof value === 'object' && value !== null) {
          this.sanitizeObjectInPlace(value);
        }
        // Primitives (numbers, booleans) are left as-is
      }
    }
  }

  /**
   * Sanitize a string value
   * Removes HTML tags and potential XSS vectors
   */
  private sanitizeString(value: string): string {
    try {
      const sanitized = sanitizeHtml(value, this.sanitizeConfig);

      // Log if sanitization changed the value (potential attack detected)
      if (sanitized !== value) {
        this.logger.warn(
          `Sanitized potentially malicious input: "${value.substring(0, 50)}..."`,
        );
      }

      return sanitized;
    } catch (error: any) {
      this.logger.error(`Sanitization failed: ${error?.message}`);
      // Return empty string if sanitization fails (fail-safe)
      return '';
    }
  }
}
