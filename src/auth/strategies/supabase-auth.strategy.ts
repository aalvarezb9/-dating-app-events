import { Injectable, Logger, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { createClient, SupabaseClient, User as SupabaseUser, Session as SupabaseSession } from '@supabase/supabase-js';
import { SharedConfigService } from '../../config/env.config';
import {
  AuthService,
  AuthUser,
  AuthSession,
  SignUpOptions,
  SignUpResult,
  SignInResult,
  UpdateMetadataOptions,
} from '../auth-service.interface';

/**
 * Supabase Auth Strategy
 *
 * Implementation of AuthService for Supabase Auth.
 * Maps generic auth operations to Supabase-specific API calls.
 *
 * Features:
 * - User sign up with email/password
 * - User sign in
 * - Update user metadata (tenantId, tenantType, etc.)
 * - Token refresh
 * - Password reset
 * - User retrieval
 *
 * @example
 * ```typescript
 * @Injectable()
 * export class BusinessAuthService {
 *   constructor(private authService: AuthService) {}
 *
 *   async registerBusiness(dto: RegisterDto) {
 *     const { user } = await this.authService.signUp({
 *       email: dto.email,
 *       password: dto.password,
 *       metadata: { firstName: dto.firstName, lastName: dto.lastName },
 *     });
 *
 *     // Business logic here...
 *
 *     await this.authService.updateUserMetadata(user.id, {
 *       tenantId: tenant.id,
 *       tenantType: 'BUSINESS',
 *     });
 *   }
 * }
 * ```
 */
@Injectable()
export class SupabaseAuthStrategy extends AuthService {
  private readonly supabase: SupabaseClient;
  private readonly logger = new Logger(SupabaseAuthStrategy.name);

  constructor(private config: SharedConfigService) {
    super();
    const supabaseConfig = this.config.supabase;

    this.supabase = createClient(
      supabaseConfig.url,
      supabaseConfig.serviceRoleKey, // Use service role for admin operations
    );

    this.logger.log(`SupabaseAuthStrategy initialized`);
  }

  /**
   * Map Supabase User to generic AuthUser
   */
  private mapUser(supabaseUser: SupabaseUser): AuthUser {
    return {
      id: supabaseUser.id,
      email: supabaseUser.email!,
      emailConfirmed: supabaseUser.email_confirmed_at !== null,
      metadata: supabaseUser.user_metadata,
      appMetadata: supabaseUser.app_metadata,
      createdAt: new Date(supabaseUser.created_at),
    };
  }

  /**
   * Map Supabase Session to generic AuthSession
   */
  private mapSession(supabaseSession: SupabaseSession, supabaseUser: SupabaseUser): AuthSession {
    return {
      accessToken: supabaseSession.access_token,
      refreshToken: supabaseSession.refresh_token,
      expiresAt: supabaseSession.expires_at!,
      user: this.mapUser(supabaseUser),
    };
  }

  async signUp(options: SignUpOptions): Promise<SignUpResult> {
    try {
      const { data, error } = await this.supabase.auth.signUp({
        email: options.email,
        password: options.password,
        options: {
          data: options.metadata || {},
        },
      });

      if (error) {
        this.logger.error(`Sign up failed: ${error.message}`, error);
        throw new BadRequestException(`Failed to create user: ${error.message}`);
      }

      if (!data.user) {
        throw new BadRequestException('Failed to create user: No user returned');
      }

      this.logger.log(`User signed up: ${data.user.id} (${options.email})`);

      return {
        user: this.mapUser(data.user),
        session: data.session ? this.mapSession(data.session, data.user) : null,
      };
    } catch (error: any) {
      this.logger.error(`Sign up error: ${error.message}`);
      throw error;
    }
  }

  async signIn(email: string, password: string): Promise<SignInResult> {
    try {
      const { data, error } = await this.supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        this.logger.error(`Sign in failed: ${error.message}`);
        throw new UnauthorizedException('Invalid email or password');
      }

      if (!data.session) {
        throw new UnauthorizedException('Failed to create session');
      }

      this.logger.log(`User signed in: ${data.user.id} (${email})`);

      return {
        user: this.mapUser(data.user),
        session: this.mapSession(data.session, data.user),
        accessToken: data.session.access_token,
        refreshToken: data.session.refresh_token,
      };
    } catch (error: any) {
      this.logger.error(`Sign in error: ${error.message}`);
      throw error;
    }
  }

  async updateUserMetadata(userId: string, metadata: UpdateMetadataOptions): Promise<void> {
    try {
      const { error } = await this.supabase.auth.admin.updateUserById(userId, {
        app_metadata: metadata,
      });

      if (error) {
        this.logger.error(`Update metadata failed: ${error.message}`, error);
        throw new BadRequestException(`Failed to update user metadata: ${error.message}`);
      }

      this.logger.log(`User metadata updated: ${userId}`);
    } catch (error: any) {
      this.logger.error(`Update metadata error: ${error.message}`);
      throw error;
    }
  }

  async refreshToken(refreshToken: string): Promise<SignInResult> {
    try {
      const { data, error } = await this.supabase.auth.refreshSession({
        refresh_token: refreshToken,
      });

      if (error || !data.session || !data.user) {
        this.logger.error(`Token refresh failed: ${error?.message}`);
        throw new UnauthorizedException('Invalid refresh token');
      }

      this.logger.log(`Token refreshed for user: ${data.user.id}`);

      return {
        user: this.mapUser(data.user),
        session: this.mapSession(data.session, data.user),
        accessToken: data.session.access_token,
        refreshToken: data.session.refresh_token,
      };
    } catch (error: any) {
      this.logger.error(`Refresh token error: ${error.message}`);
      throw error;
    }
  }

  async signOut(accessToken: string): Promise<void> {
    try {
      const { error } = await this.supabase.auth.admin.signOut(accessToken);

      if (error) {
        this.logger.error(`Sign out failed: ${error.message}`);
        throw new BadRequestException(`Failed to sign out: ${error.message}`);
      }

      this.logger.log('User signed out');
    } catch (error: any) {
      this.logger.error(`Sign out error: ${error.message}`);
      throw error;
    }
  }

  async getUserById(userId: string): Promise<AuthUser | null> {
    try {
      const { data, error } = await this.supabase.auth.admin.getUserById(userId);

      if (error) {
        this.logger.error(`Get user failed: ${error.message}`);
        throw new UnauthorizedException('User not found');
      }

      return this.mapUser(data.user);
    } catch (error: any) {
      this.logger.error(`Get user error: ${error.message}`);
      throw error;
    }
  }

  async sendPasswordResetEmail(email: string): Promise<void> {
    try {
      const { error } = await this.supabase.auth.resetPasswordForEmail(email);

      if (error) {
        this.logger.error(`Password reset failed: ${error.message}`);
        throw new BadRequestException(`Failed to send password reset email: ${error.message}`);
      }

      this.logger.log(`Password reset email sent to: ${email}`);
    } catch (error: any) {
      this.logger.error(`Password reset error: ${error.message}`);
      throw error;
    }
  }

  async verifyUserEmail(userId: string): Promise<void> {
    try {
      const { error } = await this.supabase.auth.admin.updateUserById(userId, {
        email_confirm: true,
      });

      if (error) {
        this.logger.error(`Email verification failed: ${error.message}`);
        throw new BadRequestException(`Failed to verify email: ${error.message}`);
      }

      this.logger.log(`Email verified for user: ${userId}`);
    } catch (error: any) {
      this.logger.error(`Email verification error: ${error.message}`);
      throw error;
    }
  }

  async deleteUser(userId: string): Promise<void> {
    try {
      const { error } = await this.supabase.auth.admin.deleteUser(userId);

      if (error) {
        this.logger.error(`Delete user failed: ${error.message}`);
        throw new BadRequestException(`Failed to delete user: ${error.message}`);
      }

      this.logger.log(`User deleted: ${userId}`);
    } catch (error: any) {
      this.logger.error(`Delete user error: ${error.message}`);
      throw error;
    }
  }
}
