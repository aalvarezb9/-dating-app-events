import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { SupabaseJwtStrategy } from './supabase-jwt.strategy';
import { SharedConfigModule } from '../config/shared-config.module';

/**
 * Auth Module
 *
 * Provides Supabase JWT authentication strategy for all services.
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
  providers: [SupabaseJwtStrategy],
  exports: [SupabaseJwtStrategy, PassportModule],
})
export class AuthModule {}
