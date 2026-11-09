import {
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { IS_INTERNAL_API_KEY } from '../decorators/internal-api.decorator';
import { FORBIDDEN_IN_SUPPORT_SESSION, SAFE_HTTP_METHODS } from '../../auth/support-session';

@Injectable()
export class JwtAuthGuard extends AuthGuard('supabase-jwt') {
  constructor(private reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // Internal endpoints have no user: InternalApiKeyGuard (applied by @InternalApi()) protects them
    const isInternal = this.reflector.getAllAndOverride<boolean>(IS_INTERNAL_API_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic || isInternal) {
      return true;
    }

    return super.canActivate(context);
  }

  handleRequest(err: any, user: any, info: any, context?: ExecutionContext) {
    if (err || !user) {
      throw err || new UnauthorizedException('Invalid or expired token');
    }

    // A super administrator acting as this person (support): a `read_only` session can only look, and no session can
    // touch the credentials of the person. Every service has this guard, so the rule holds everywhere.
    if (user.impersonatedBy && context) {
      const request = context.switchToHttp().getRequest();
      const path = String(request.path ?? request.url ?? '').split('?')[0];
      if (FORBIDDEN_IN_SUPPORT_SESSION.some((forbidden) => forbidden.test(path))) {
        throw new ForbiddenException('support.error.forbidden_in_support_session');
      }
      if (user.supportMode !== 'full' && !SAFE_HTTP_METHODS.has(String(request.method).toUpperCase())) {
        throw new ForbiddenException('support.error.read_only_session');
      }
    }
    return user;
  }
}
