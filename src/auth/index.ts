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
export * from './strategies/cognito-auth.strategy';
export * from './strategies/cognito-jwt.strategy';

// Verifies tokens of Cognito and of the support sessions, with one entry
export * from './token-verifier';

// Cut the sessions of a person that was deleted or banned
export * from './user-block';

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
