/**
 * Auth Service - Abstract Contract
 *
 * Defines the contract for authentication operations.
 * Implementations (strategies) handle provider-specific logic (Supabase, Cognito, etc.).
 *
 * IMPORTANT: These contracts are PROVIDER-AGNOSTIC.
 * Strategies must map provider-specific types to these generic types.
 */

/**
 * Generic User representation
 */
export interface AuthUser {
  id: string;
  email: string;
  emailConfirmed: boolean;
  metadata?: Record<string, any>;
  appMetadata?: Record<string, any>;
  createdAt: Date;
}

/**
 * Generic Session representation
 */
export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  user: AuthUser;
}

/**
 * Sign up options
 */
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

/**
 * Sign up result
 */
export interface SignUpResult {
  user: AuthUser;
  session: AuthSession | null;
}

/**
 * Sign in result
 */
export interface SignInResult {
  user: AuthUser;
  session: AuthSession;
  accessToken: string;
  refreshToken: string;
}

/**
 * Update metadata options
 */
export interface UpdateMetadataOptions {
  tenantId?: string;
  tenantType?: string;
  [key: string]: any;
}

/**
 * Abstract class defining the auth service contract.
 * All auth providers must implement this interface.
 */
export abstract class AuthService {
  /**
   * Sign up a new user with email and password
   *
   * @param options - Sign up options
   * @returns User and session
   */
  abstract signUp(options: SignUpOptions): Promise<SignUpResult>;

  /**
   * Sign in a user with email and password
   *
   * @param email - User email
   * @param password - User password
   * @returns User, session, and tokens
   */
  abstract signIn(email: string, password: string): Promise<SignInResult>;

  /**
   * Update user metadata (app_metadata)
   * Used to store tenantId, tenantType, etc.
   *
   * @param userId - User ID
   * @param metadata - Metadata to update
   */
  abstract updateUserMetadata(userId: string, metadata: UpdateMetadataOptions): Promise<void>;

  /**
   * Refresh access token using refresh token
   *
   * @param refreshToken - Refresh token
   * @returns New session with fresh tokens
   */
  abstract refreshToken(refreshToken: string): Promise<SignInResult>;

  /**
   * Sign out a user
   *
   * @param accessToken - User's access token
   */
  abstract signOut(accessToken: string): Promise<void>;

  /**
   * Get user by ID
   *
   * @param userId - User ID
   * @returns User object or null
   */
  abstract getUserById(userId: string): Promise<AuthUser | null>;

  /**
   * Send password reset email
   *
   * @param email - User email
   */
  abstract sendPasswordResetEmail(email: string): Promise<void>;

  /**
   * Verify user's email (admin operation)
   *
   * @param userId - User ID
   */
  abstract verifyUserEmail(userId: string): Promise<void>;

  /**
   * Delete user (admin operation)
   *
   * @param userId - User ID
   */
  abstract deleteUser(userId: string): Promise<void>;
}
