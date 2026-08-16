import { Module, Global } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { SupabaseJwtStrategy } from './strategies/supabase-jwt.strategy';
import { AuthService } from './auth-service.interface';
import { SupabaseAuthStrategy } from './strategies/supabase-auth.strategy';
import { SharedConfigModule } from '../config/shared-config.module';
import { SharedConfigService } from '../config/env.config';

/**
 * Auth Module
 *
 * Provides authentication services using Strategy Pattern.
 * The actual strategy is determined at runtime based on AUTH_PROVIDER env var.
 *
 * Supported providers:
 * - 'supabase' (default): SupabaseAuthStrategy
 * - 'cognito' (future): CognitoAuthStrategy
 *
 * To add a new provider:
 * 1. Create strategy class extending AuthService
 * 2. Add to useFactory switch case below
 *
 * @example
 * ```typescript
 * // In app.module.ts
 * @Module({
 *   imports: [
 *     SharedConfigModule,
 *     AuthModule,
 *     ...
 *   ],
 * })
 * export class AppModule {}
 * ```
 */
@Global()
@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'supabase-jwt' }),
    SharedConfigModule,
  ],
  providers: [
    SupabaseJwtStrategy,
    {
      provide: AuthService,
      useFactory: (config: SharedConfigService) => {
        const provider = config.get('AUTH_PROVIDER') || 'supabase';

        switch (provider) {
          case 'supabase':
            return new SupabaseAuthStrategy(config);
          // Future providers:
          // case 'cognito':
          //   return new CognitoAuthStrategy(config);
          default:
            throw new Error(`Unknown auth provider: ${provider}`);
        }
      },
      inject: [SharedConfigService],
    },
  ],
  exports: [SupabaseJwtStrategy, AuthService, PassportModule],
})
export class AuthModule {}
