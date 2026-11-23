import { Module, Global } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { TenantBlockCache } from './tenant-block';
import { CognitoJwtStrategy } from './strategies/cognito-jwt.strategy';
import { AuthService } from './auth-service.interface';
import { CognitoAuthStrategy } from './strategies/cognito-auth.strategy';
import { SharedConfigModule } from '../config/shared-config.module';
import { SharedConfigService } from '../config/env.config';

/**
 * Auth Module
 *
 * Provides authentication services using Strategy Pattern.
 * The actual strategy is determined at runtime based on the AUTH_PROVIDER env var (required, no default).
 *
 * Supported providers:
 * - 'cognito': CognitoAuthStrategy + CognitoJwtStrategy (which also verifies the tokens of the support sessions)
 *
 * The JWT strategy is registered in passport as `jwt`, the name `JwtAuthGuard` asks for.
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
    PassportModule.register({ defaultStrategy: 'jwt' }),
    SharedConfigModule,
  ],
  providers: [
    {
      provide: 'JWT_STRATEGY',
      useFactory: (config: SharedConfigService, cache?: TenantBlockCache) => {
        const provider = config.authProvider;

        switch (provider) {
          case 'cognito':
            return new CognitoJwtStrategy(config, cache);
          default:
            throw new Error(`Unknown auth provider for JWT: ${provider}`);
        }
      },
      // The cache is optional: it holds the block flags of the tenants (RedisCacheModule, global)
      inject: [SharedConfigService, { token: CACHE_MANAGER, optional: true }],
    },
    {
      provide: AuthService,
      useFactory: (config: SharedConfigService) => {
        const provider = config.authProvider;

        switch (provider) {
          case 'cognito':
            return new CognitoAuthStrategy(config);
          default:
            throw new Error(`Unknown auth provider: ${provider}`);
        }
      },
      inject: [SharedConfigService],
    },
  ],
  exports: ['JWT_STRATEGY', AuthService, PassportModule],
})
export class AuthModule {}
