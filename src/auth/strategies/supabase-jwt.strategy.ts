import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, ExtractJwt } from 'passport-jwt';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { SharedConfigService } from '../../config/env.config';
import WebSocket from 'ws';

/**
 * Supabase JWT Strategy
 *
 * Validates JWT tokens issued by Supabase Auth.
 * Extracts user information and custom claims (tenantId, tenantType) from token.
 *
 * Features:
 * - JWT validation using Supabase JWT secret
 * - User verification via Supabase Auth API
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

  constructor(private config: SharedConfigService) {
    const supabaseConfig = config.supabase;

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: supabaseConfig.jwtSecret,
      algorithms: ['HS256'],
    });

    this.supabase = createClient(
      supabaseConfig.url,
      supabaseConfig.serviceRoleKey,
      {
        realtime: {
          transport: WebSocket as any,
        },
      },
    );
  }

  /**
   * Validates the JWT payload and enriches user data
   *
   * @param payload - JWT payload from Supabase token
   * @returns Validated user object with custom claims
   * @throws UnauthorizedException if user is invalid
   */
  async validate(payload: any) {
    // Verify user exists in Supabase Auth
    const { data, error } = await this.supabase.auth.admin.getUserById(payload.sub);

    if (error || !data.user) {
      throw new UnauthorizedException('Invalid token');
    }

    // Extract user data and custom claims
    return {
      userId: payload.sub,
      email: payload.email,
      tenantId: payload.app_metadata?.tenantId,
      tenantType: payload.app_metadata?.tenantType,
      role: payload.role,
    };
  }
}
