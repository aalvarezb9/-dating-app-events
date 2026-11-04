import {
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { IS_INTERNAL_API_KEY } from '../decorators/internal-api.decorator';

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

  handleRequest(err: any, user: any, info: any) {
    if (err || !user) {
      throw err || new UnauthorizedException('Invalid or expired token');
    }
    return user;
  }
}
