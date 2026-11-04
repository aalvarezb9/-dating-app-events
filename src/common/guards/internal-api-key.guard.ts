import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { timingSafeEqual } from 'crypto';
import { SharedConfigService } from '../../config/env.config';

/**
 * Guard of the internal (service-to-service) endpoints: requires the X-API-Key header to match
 * INTER_SERVICE_API_KEY. Unlike ApiKeyGuard it NEVER skips the check (it does not honor
 * @Public()), because @InternalApi() routes bypass the JWT guard and this is their only barrier.
 * Applied by @InternalApi(); do not use it directly.
 */
@Injectable()
export class InternalApiKeyGuard implements CanActivate {
  constructor(private readonly config: SharedConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const validApiKey = this.config.get('INTER_SERVICE_API_KEY');
    if (!validApiKey) {
      throw new Error('INTER_SERVICE_API_KEY is not configured');
    }

    const request = context.switchToHttp().getRequest();
    const received = request.headers['x-api-key'];
    if (typeof received !== 'string' || !this.sameKey(received, validApiKey)) {
      throw new UnauthorizedException('Invalid or missing API Key');
    }

    if (request.headers['x-service-name']) {
      request.serviceName = request.headers['x-service-name'];
    }
    return true;
  }

  private sameKey(received: string, expected: string): boolean {
    const a = Buffer.from(received);
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
  }
}
