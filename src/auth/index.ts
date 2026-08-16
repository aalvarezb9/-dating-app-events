/**
 * Auth Module
 *
 * Exports:
 * - AuthService: Abstract contract for auth operations
 * - SupabaseAuthStrategy: Concrete implementation for Supabase Auth
 * - SupabaseJwtStrategy: JWT validation strategy for Supabase
 * - AuthModule: Module configuration with provider
 */

// Abstract contract and interfaces
export * from './auth-service.interface';

// Concrete strategies
export * from './strategies/supabase-auth.strategy';
export * from './strategies/supabase-jwt.strategy';

// Module
export * from './auth.module';
