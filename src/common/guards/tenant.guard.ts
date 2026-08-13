import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { TenantType } from '../types/auth.types';

@Injectable()
export class TenantGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user || !user.tenantId) {
      throw new ForbiddenException('Tenant information is missing');
    }

    const allowedTenantTypes = [TenantType.BUSINESS];

    if (!allowedTenantTypes.includes(user.tenantType)) {
      throw new ForbiddenException(
        'Access denied. Only business tenants are allowed.',
      );
    }

    return true;
  }
}
