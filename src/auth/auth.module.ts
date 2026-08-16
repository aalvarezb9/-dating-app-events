import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { SupabaseJwtStrategy } from './supabase-jwt.strategy';
import { SupabaseAuthService } from './supabase-auth.service';
import { SharedConfigModule } from '../config/shared-config.module';

/**
 * Auth Module
 *
 * Provides Supabase authentication services for all microservices.
 *
 * Exports:
 * - SupabaseJwtStrategy: JWT validation strategy
 * - SupabaseAuthService: Auth operations (signUp, signIn, etc.)
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
@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'supabase-jwt' }),
    SharedConfigModule,
  ],
  providers: [SupabaseJwtStrategy, SupabaseAuthService],
  exports: [SupabaseJwtStrategy, SupabaseAuthService, PassportModule],
})
export class AuthModule {}
