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
 * Global exception filter to handle all HTTP exceptions
 * and return a consistent error response format
 */
@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const status = exception.getStatus();
    const exceptionResponse = exception.getResponse();

    // Extract error message
    let message: string | string[];
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

    // Log the error, with the id of the request so it can be found from the one the gateway answered
    this.logger.error(
      `[${readRequestId(request.headers) ?? '-'}] HTTP Exception: ${status} - ${request.method} ${redactUrl(request.url)} - ${JSON.stringify(message)}`,
      exception.stack,
    );

    // Send consistent error response. The path is not part of it: the caller knows what it asked for, and a URL echoed back
    // can carry a secret (the token of a link) or an input an attacker chose
    response.status(status).json({
      statusCode: status,
      message,
      error: exception.name,
      timestamp: new Date().toISOString(),
    });
  }
}
