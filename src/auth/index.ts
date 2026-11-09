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

// Cut the sessions of a tenant that is not active
export * from './tenant-block';

// Sessions of the super administrators that passed the second factor
export * from './admin-session';

// Sessions in which a super administrator acts as another person to give them support
export * from './support-session';

// Feature flags the administration publishes and any service reads
export * from './feature-flags';

// Module
export * from './auth.module';
