import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { redactUrl } from '../utils/redact';
import { readRequestId } from '../utils/request-trace';

/**
 * Global exception filter to catch ALL exceptions
 * including non-HTTP exceptions (database errors, etc.)
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status: number;
    let message: string | string[];
    let errorName: string;
    const requestId = readRequestId(request.headers) ?? '-';

    // Handle HTTP exceptions
    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      } else if (
        typeof exceptionResponse === 'object' &&
        'message' in exceptionResponse
      ) {
        message = (exceptionResponse as any).message;
      } else {
        message = 'An error occurred';
      }
      errorName = exception.name;
    }
    // Handle non-HTTP exceptions (database errors, etc.)
    else if (exception instanceof Error) {
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      message = exception.message || 'Internal server error';
      errorName = exception.name || 'Error';

      // Log full stack trace for non-HTTP errors
      this.logger.error(
        `[${requestId}] Unhandled Exception: ${request.method} ${redactUrl(request.url)}`,
        exception.stack,
      );
    }
    // Handle unknown exceptions
    else {
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      message = 'Internal server error';
      errorName = 'UnknownError';

      this.logger.error(
        `[${requestId}] Unknown Exception: ${request.method} ${redactUrl(request.url)} -${JSON.stringify(exception)}`,
      );
    }

    // Send consistent error response (no path: see HttpExceptionFilter)
    response.status(status).json({
      statusCode: status,
      message,
      error: errorName,
      timestamp: new Date().toISOString(),
    });
  }
}
