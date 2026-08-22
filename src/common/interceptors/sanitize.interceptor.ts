import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import * as sanitizeHtml from 'sanitize-html';

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
  private readonly sanitizeConfig: sanitizeHtml.IOptions = {
    allowedTags: [], // Remove ALL HTML tags
    allowedAttributes: {}, // Remove ALL attributes
    disallowedTagsMode: 'recursiveEscape', // Escape instead of removing
  };

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();

    // Sanitize all incoming data sources
    if (request.body && typeof request.body === 'object') {
      request.body = this.sanitizeObject(request.body);
    }

    if (request.query && typeof request.query === 'object') {
      request.query = this.sanitizeObject(request.query);
    }

    if (request.params && typeof request.params === 'object') {
      request.params = this.sanitizeObject(request.params);
    }

    return next.handle();
  }

  /**
   * Recursively sanitize an object, array, or string
   */
  private sanitizeObject(obj: any): any {
    // Handle strings - sanitize HTML
    if (typeof obj === 'string') {
      return this.sanitizeString(obj);
    }

    // Handle arrays - sanitize each item
    if (Array.isArray(obj)) {
      return obj.map((item) => this.sanitizeObject(item));
    }

    // Handle objects - sanitize each property
    if (obj !== null && typeof obj === 'object') {
      const sanitized: any = {};
      for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
          sanitized[key] = this.sanitizeObject(obj[key]);
        }
      }
      return sanitized;
    }

    // Return primitives as-is (numbers, booleans, null, undefined)
    return obj;
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
    } catch (error) {
      this.logger.error(`Sanitization failed: ${error.message}`);
      // Return empty string if sanitization fails (fail-safe)
      return '';
    }
  }
}
