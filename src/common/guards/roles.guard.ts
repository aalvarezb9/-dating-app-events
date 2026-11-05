import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { IS_INTERNAL_API_KEY } from '../decorators/internal-api.decorator';
import { UserRole } from '../types/auth.types';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // Check if route is public
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // Internal routes have no user: InternalApiKeyGuard (applied by @InternalApi()) is their barrier
    const isInternal = this.reflector.getAllAndOverride<boolean>(IS_INTERNAL_API_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic || isInternal) {
      return true;
    }

    // Get required roles from @Roles() decorator
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    // Fail closed: a private route that forgot its @Roles() is a mistake, and "any authenticated user"
    // (a customer included) is the worst way to find out. Declare @Roles(...) or @Public().
    if (!requiredRoles || requiredRoles.length === 0) {
      throw new ForbiddenException('This route declares no roles');
    }

    // Check if user has required role
    const { user } = context.switchToHttp().getRequest();

    if (!user) {
      throw new ForbiddenException('User not authenticated');
    }

    const hasRole = requiredRoles.some((role: UserRole) => user.role === role);

    if (!hasRole) {
      throw new ForbiddenException(
        `Access denied. Required roles: ${requiredRoles.join(', ')}`,
      );
    }

    return true;
  }
}
