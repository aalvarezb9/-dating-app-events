import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { SharedConfigService } from '../../config/env.config';

/**
 * ApiKeyGuard
 *
 * Guard for validating API Key in inter-service HTTP communication.
 * Checks the X-API-Key header against INTER_SERVICE_API_KEY environment variable.
 *
 * Respects @Public() decorator - public endpoints bypass API key validation.
 *
 * Usage:
 * ```typescript
 * // In app.module.ts (global guard)
 * providers: [
 *   {
 *     provide: APP_GUARD,
 *     useClass: ApiKeyGuard,
 *   },
 * ]
 *
 * // In controller (skip validation for specific endpoints)
 * @Get('health')
 * @Public()
 * healthCheck() {
 *   return { status: 'ok' };
 * }
 * ```
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly config: SharedConfigService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    // Check if endpoint is public
    const isPublic = this.reflector.getAllAndOverride<boolean>('isPublic', [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const apiKey = request.headers['x-api-key'];
    const serviceName = request.headers['x-service-name'];

    // Validate API Key
    const validApiKey = this.config.get('INTER_SERVICE_API_KEY');

    if (!validApiKey) {
      throw new Error('INTER_SERVICE_API_KEY is not configured');
    }

    if (!apiKey || apiKey !== validApiKey) {
      throw new UnauthorizedException('Invalid or missing API Key');
    }

    // Attach service name to request for logging/auditing
    if (serviceName) {
      request.serviceName = serviceName;
    }

    return true;
  }
}
