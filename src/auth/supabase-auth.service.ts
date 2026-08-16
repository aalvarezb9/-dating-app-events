import { Injectable, Logger, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { createClient, SupabaseClient, User, Session } from '@supabase/supabase-js';
import { SharedConfigService } from '../config/env.config';

export interface SignUpOptions {
  email: string;
  password: string;
  metadata?: {
    firstName?: string;
    lastName?: string;
    phone?: string;
    [key: string]: any;
  };
}

export interface SignUpResult {
  user: User;
  session: Session | null;
}

export interface SignInResult {
  user: User;
  session: Session;
  accessToken: string;
  refreshToken: string;
}

export interface UpdateMetadataOptions {
  tenantId?: string;
  tenantType?: string;
  [key: string]: any;
}

/**
 * Supabase Auth Service
 *
 * Provides shared authentication operations using Supabase Auth.
 * This service handles PURE auth operations - business logic should be in service-specific AuthService.
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
 * export class AuthService {
 *   constructor(
 *     private supabaseAuth: SupabaseAuthService,
 *     private tenantRepo: TenantRepository,
 *   ) {}
 *
 *   async registerBusiness(dto: RegisterDto) {
 *     // 1. Create user in Supabase Auth
 *     const { user } = await this.supabaseAuth.signUp({
 *       email: dto.email,
 *       password: dto.password,
 *       metadata: {
 *         firstName: dto.firstName,
 *         lastName: dto.lastName,
 *       },
 *     });
 *
 *     // 2. Create tenant (business logic)
 *     const tenant = await this.tenantRepo.save({ ... });
 *
 *     // 3. Update user metadata with tenantId
 *     await this.supabaseAuth.updateUserMetadata(user.id, {
 *       tenantId: tenant.id,
 *       tenantType: 'BUSINESS',
 *     });
 *   }
 * }
 * ```
 */
@Injectable()
export class SupabaseAuthService {
  private readonly supabase: SupabaseClient;
  private readonly logger = new Logger(SupabaseAuthService.name);

  constructor(private config: SharedConfigService) {
    const supabaseConfig = this.config.supabase;

    this.supabase = createClient(
      supabaseConfig.url,
      supabaseConfig.serviceRoleKey, // Use service role for admin operations
    );

    this.logger.log(`SupabaseAuthService initialized`);
  }

  /**
   * Sign up a new user with email and password
   *
   * @param options - Sign up options
   * @returns User and session
   */
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
        user: data.user,
        session: data.session,
      };
    } catch (error: any) {
      this.logger.error(`Sign up error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Sign in a user with email and password
   *
   * @param email - User email
   * @param password - User password
   * @returns User, session, and tokens
   */
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
        user: data.user,
        session: data.session,
        accessToken: data.session.access_token,
        refreshToken: data.session.refresh_token,
      };
    } catch (error: any) {
      this.logger.error(`Sign in error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Update user metadata (app_metadata)
   * Used to store tenantId, tenantType, etc.
   *
   * @param userId - Supabase user ID
   * @param metadata - Metadata to update
   */
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

  /**
   * Refresh access token using refresh token
   *
   * @param refreshToken - Refresh token
   * @returns New session with fresh tokens
   */
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
        user: data.user,
        session: data.session,
        accessToken: data.session.access_token,
        refreshToken: data.session.refresh_token,
      };
    } catch (error: any) {
      this.logger.error(`Refresh token error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Sign out a user
   *
   * @param accessToken - User's access token
   */
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

  /**
   * Get user by ID
   *
   * @param userId - Supabase user ID
   * @returns User object
   */
  async getUserById(userId: string): Promise<User | null> {
    try {
      const { data, error } = await this.supabase.auth.admin.getUserById(userId);

      if (error) {
        this.logger.error(`Get user failed: ${error.message}`);
        throw new UnauthorizedException('User not found');
      }

      return data.user;
    } catch (error: any) {
      this.logger.error(`Get user error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Send password reset email
   *
   * @param email - User email
   */
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

  /**
   * Verify user's email (admin operation)
   *
   * @param userId - Supabase user ID
   */
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

  /**
   * Delete user (admin operation)
   *
   * @param userId - Supabase user ID
   */
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
