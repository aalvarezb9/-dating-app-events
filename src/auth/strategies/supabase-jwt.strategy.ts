import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, ExtractJwt } from 'passport-jwt';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Cache } from 'cache-manager';
import { SharedConfigService } from '../../config/env.config';
import { tenantBlockedWith } from '../tenant-block';

/** How long a successful "user still exists" check is reused */
const USER_CHECK_TTL_MS = 60_000;
const USER_CHECK_CACHE_MAX_ENTRIES = 10_000;

/**
 * Supabase JWT Strategy
 *
 * Validates JWT tokens issued by Supabase Auth.
 * Extracts user information and custom claims (tenantId, tenantType) from token.
 *
 * Features:
 * - JWT validation using Supabase JWT secret
 * - User verification via Supabase Auth API
 * - Tenant check: a token of a tenant that is not active any more (pending, suspended, rejected) is
 *   refused with 403 even though it has not expired (see ../tenant-block.ts)
 * - Custom claims extraction (app_metadata)
 * - Integration with NestJS Guards
 *
 * @example
 * ```typescript
 * // In app.module.ts
 * @Module({
 *   imports: [
 *     PassportModule.register({ defaultStrategy: 'supabase-jwt' }),
 *     ...
 *   ],
 *   providers: [SupabaseJwtStrategy],
 * })
 * export class AppModule {}
 *
 * // In controller
 * @Controller('business')
 * @UseGuards(AuthGuard('supabase-jwt'))
 * export class BusinessController {
 *   @Get('profile')
 *   getProfile(@Request() req) {
 *     // req.user contains validated user data
 *     const { userId, tenantId, tenantType } = req.user;
 *   }
 * }
 * ```
 */
@Injectable()
export class SupabaseJwtStrategy extends PassportStrategy(Strategy, 'supabase-jwt') {
  private supabase: SupabaseClient;

  /**
   * @param cache the shared Redis cache that holds the block flags of the tenants. Without it the tenant
   *              check is skipped (a service that does not import RedisCacheModule).
   */
  constructor(
    private config: SharedConfigService,
    private cache?: Cache,
  ) {
    const supabaseConfig = config.supabase;

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: supabaseConfig.jwtSecret,
      algorithms: ['HS256'],
    });

    this.supabase = createClient(
      supabaseConfig.url,
      supabaseConfig.serviceRoleKey
    );
  }

  /** userId -> instant until which the existence check is considered fresh */
  private readonly verifiedUsers = new Map<string, number>();

  private async assertUserExists(userId: string): Promise<void> {
    const now = Date.now();
    const freshUntil = this.verifiedUsers.get(userId);
    if (freshUntil !== undefined && freshUntil > now) {
      return;
    }

    const { data, error } = await this.supabase.auth.admin.getUserById(userId);

    if (error || !data.user) {
      this.verifiedUsers.delete(userId);
      throw new UnauthorizedException('Invalid token');
    }

    if (this.verifiedUsers.size >= USER_CHECK_CACHE_MAX_ENTRIES) {
      for (const [id, until] of this.verifiedUsers) {
        if (until <= now) {
          this.verifiedUsers.delete(id);
        }
      }
      if (this.verifiedUsers.size >= USER_CHECK_CACHE_MAX_ENTRIES) {
        this.verifiedUsers.clear();
      }
    }

    this.verifiedUsers.set(userId, now + USER_CHECK_TTL_MS);
  }

  /**
   * Validates the JWT payload and enriches user data
   *
   * @param payload - JWT payload from Supabase token
   * @returns Validated user object with custom claims
   * @throws UnauthorizedException if user is invalid
   * @throws ForbiddenException if the tenant of the user is not active any more
   */
  async validate(payload: any) {
    // The signature is already verified; confirming with Supabase that the user still exists
    // is cached briefly so it does not cost a network round-trip on every request.
    // Trade-off: a user deleted in Supabase can keep acting for at most USER_CHECK_TTL_MS.
    await this.assertUserExists(payload.sub);

    // Not cached in memory like the check above: a suspension must cut the sessions right away
    const tenantId = payload.app_metadata?.tenantId;
    const blockedWith = await tenantBlockedWith(this.cache, tenantId);
    if (blockedWith) {
      throw new ForbiddenException(`account.error.tenant_${blockedWith}`);
    }

    // Extract user data and custom claims
    return {
      userId: payload.sub,
      email: payload.email,
      tenantId,
      tenantType: payload.app_metadata?.tenantType,
      role: payload.app_metadata?.role || payload.role, // Prefer custom role from app_metadata
    };
  }
}
