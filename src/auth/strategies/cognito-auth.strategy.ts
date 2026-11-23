import { createHmac } from 'crypto';
import { BadRequestException, ConflictException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import {
  AdminCreateUserCommand,
  AdminDeleteUserCommand,
  AdminDisableUserCommand,
  AdminEnableUserCommand,
  AdminGetUserCommand,
  AdminInitiateAuthCommand,
  AdminSetUserPasswordCommand,
  AdminUpdateUserAttributesCommand,
  AdminUserGlobalSignOutCommand,
  AttributeType,
  AuthenticationResultType,
  CognitoIdentityProviderClient,
  ConfirmForgotPasswordCommand,
  ForgotPasswordCommand,
  GlobalSignOutCommand,
  InitiateAuthCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { SharedConfigService } from '../../config/env.config';
import { AuthService, AuthSession, AuthUser, SignInResult, SignUpOptions, SignUpResult, UpdateMetadataOptions } from '../auth-service.interface';

/** Names of the attributes the platform keeps in the user (the pre-token trigger copies them into the access token) */
const CUSTOM = ['tenantId', 'tenantType', 'role'];

/**
 * Cognito Auth Strategy: implements `AuthService` on a User Pool (AUTH_PROVIDER=cognito).
 *
 * Only `auth` has permission on the pool. People never talk to Cognito: they call `/auth/*` and this class does it for them with
 * the admin flow (`AdminInitiateAuth`), which is the only password flow the app client enables.
 *
 * Email: users are created already verified in Cognito, so the reset code reaches them (the real confirmation of the email is a
 * matter of the database of `auth`, not of this attribute).
 */
@Injectable()
export class CognitoAuthStrategy extends AuthService {
  private readonly logger = new Logger(CognitoAuthStrategy.name);
  private readonly client: CognitoIdentityProviderClient;
  private readonly poolId: string;
  private readonly clientId: string;
  private readonly clientSecret?: string;

  constructor(config: SharedConfigService) {
    super();
    const cognito = config.cognito;
    this.poolId = cognito.userPoolId;
    this.clientId = cognito.clientId;
    this.clientSecret = cognito.clientSecret;
    this.client = new CognitoIdentityProviderClient({ region: cognito.region, ...(cognito.endpoint ? { endpoint: cognito.endpoint } : {}) });
    this.logger.log('CognitoAuthStrategy initialized');
  }

  /** The hash of the app client with a secret: HMAC-SHA256(username + clientId) with the secret as key, in base64 */
  private secretHash(username: string): string | undefined {
    return this.clientSecret ? createHmac('sha256', this.clientSecret).update(username + this.clientId).digest('base64') : undefined;
  }

  private attr(attributes: AttributeType[] | undefined, name: string): string | undefined {
    return attributes?.find((a) => a.Name === name)?.Value;
  }

  private mapUser(attributes: AttributeType[] | undefined, createdAt?: Date): AuthUser {
    const appMetadata: Record<string, any> = {};
    for (const name of CUSTOM) {
      const value = this.attr(attributes, `custom:${name}`);
      if (value !== undefined) appMetadata[name] = value;
    }
    return {
      id: this.attr(attributes, 'sub')!,
      email: this.attr(attributes, 'email')!,
      emailConfirmed: this.attr(attributes, 'email_verified') === 'true',
      metadata: {
        firstName: this.attr(attributes, 'given_name'),
        lastName: this.attr(attributes, 'family_name'),
        phone: this.attr(attributes, 'phone_number'),
      },
      appMetadata,
      createdAt: createdAt ?? new Date(),
    };
  }

  /** The claims of an access token (not verified: it just came from Cognito) */
  private subOf(accessToken: string): string {
    return JSON.parse(Buffer.from(accessToken.split('.')[1], 'base64url').toString()).sub;
  }

  private mapSession(result: AuthenticationResultType, user: AuthUser, refreshFallback?: string): AuthSession {
    return {
      accessToken: result.AccessToken!,
      refreshToken: result.RefreshToken ?? refreshFallback ?? '',
      expiresAt: Math.floor(Date.now() / 1000) + (result.ExpiresIn ?? 3600),
      user,
    };
  }

  async signUp(options: SignUpOptions): Promise<SignUpResult> {
    // The phone is not sent: Cognito only takes E.164 numbers, and `auth` keeps it in its own database
    const { firstName, lastName, phone: _phone, ...rest } = options.metadata ?? {};
    const attributes: AttributeType[] = [
      { Name: 'email', Value: options.email },
      { Name: 'email_verified', Value: 'true' },
      ...(firstName ? [{ Name: 'given_name', Value: String(firstName) }] : []),
      ...(lastName ? [{ Name: 'family_name', Value: String(lastName) }] : []),
      ...CUSTOM.filter((name) => rest[name] !== undefined).map((name) => ({ Name: `custom:${name}`, Value: String(rest[name]) })),
    ];
    try {
      const created = await this.client.send(
        new AdminCreateUserCommand({ UserPoolId: this.poolId, Username: options.email, UserAttributes: attributes, MessageAction: 'SUPPRESS' }),
      );
      await this.client.send(new AdminSetUserPasswordCommand({ UserPoolId: this.poolId, Username: options.email, Password: options.password, Permanent: true }));
      const user = this.mapUser(created.User?.Attributes, created.User?.UserCreateDate);
      this.logger.log(`User signed up: ${user.id} (${options.email})`);
      return { user, session: null };
    } catch (error: any) {
      if (error?.name === 'UsernameExistsException') {
        throw new ConflictException('A user with this email already exists');
      }
      this.logger.error(`Sign up failed: ${error?.message}`);
      throw new BadRequestException(`Failed to create user: ${error?.message}`);
    }
  }

  async signIn(email: string, password: string): Promise<SignInResult> {
    let result: AuthenticationResultType | undefined;
    try {
      const response = await this.client.send(
        new AdminInitiateAuthCommand({
          UserPoolId: this.poolId,
          ClientId: this.clientId,
          AuthFlow: 'ADMIN_USER_PASSWORD_AUTH',
          AuthParameters: { USERNAME: email, PASSWORD: password, ...(this.secretHash(email) ? { SECRET_HASH: this.secretHash(email)! } : {}) },
        }),
      );
      result = response.AuthenticationResult;
    } catch {
      throw new UnauthorizedException('Invalid email or password'); // wrong password, unknown, disabled: the same answer
    }
    if (!result?.AccessToken) {
      throw new UnauthorizedException('Failed to create session');
    }
    const user = (await this.getUserById(this.subOf(result.AccessToken))) ?? this.mapUser([{ Name: 'sub', Value: this.subOf(result.AccessToken) }, { Name: 'email', Value: email }]);
    const session = this.mapSession(result, user);
    return { user, session, accessToken: session.accessToken, refreshToken: session.refreshToken };
  }

  async updateUserMetadata(userId: string, metadata: UpdateMetadataOptions): Promise<void> {
    const attributes = Object.entries(metadata)
      .filter(([name, value]) => CUSTOM.includes(name) && value !== undefined)
      .map(([name, value]) => ({ Name: `custom:${name}`, Value: String(value) }));
    if (attributes.length === 0) return;
    try {
      await this.client.send(new AdminUpdateUserAttributesCommand({ UserPoolId: this.poolId, Username: userId, UserAttributes: attributes }));
    } catch (error: any) {
      throw new BadRequestException(`Failed to update user metadata: ${error?.message}`);
    }
  }

  async refreshToken(refreshToken: string): Promise<SignInResult> {
    let result: AuthenticationResultType | undefined;
    try {
      const response = await this.client.send(
        new InitiateAuthCommand({ ClientId: this.clientId, AuthFlow: 'REFRESH_TOKEN_AUTH', AuthParameters: { REFRESH_TOKEN: refreshToken } }),
      );
      result = response.AuthenticationResult;
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
    if (!result?.AccessToken) {
      throw new UnauthorizedException('Invalid refresh token');
    }
    const sub = this.subOf(result.AccessToken);
    const user = (await this.getUserById(sub)) ?? this.mapUser([{ Name: 'sub', Value: sub }]);
    const session = this.mapSession(result, user, refreshToken); // Cognito does not rotate it: the same one keeps working
    return { user, session, accessToken: session.accessToken, refreshToken: session.refreshToken };
  }

  async signOut(accessToken: string): Promise<void> {
    try {
      await this.client.send(new GlobalSignOutCommand({ AccessToken: accessToken })); // revokes every refresh token of the user
    } catch (error: any) {
      throw new BadRequestException(`Failed to sign out: ${error?.message}`);
    }
  }

  async getUserById(userId: string): Promise<AuthUser | null> {
    try {
      const response = await this.client.send(new AdminGetUserCommand({ UserPoolId: this.poolId, Username: userId }));
      return this.mapUser(response.UserAttributes, response.UserCreateDate);
    } catch (error: any) {
      if (error?.name === 'UserNotFoundException') return null;
      throw error;
    }
  }

  async sendPasswordResetEmail(email: string): Promise<void> {
    try {
      await this.client.send(new ForgotPasswordCommand({ ClientId: this.clientId, Username: email, SecretHash: this.secretHash(email) }));
    } catch (error: any) {
      // Whether the account exists is never revealed: an unknown or unverified email is not an error for the caller
      if (error?.name === 'UserNotFoundException' || error?.name === 'InvalidParameterException') return;
      throw new BadRequestException(`Failed to send password reset email: ${error?.message}`);
    }
  }

  async confirmPasswordReset(email: string, code: string, newPassword: string): Promise<void> {
    try {
      await this.client.send(
        new ConfirmForgotPasswordCommand({ ClientId: this.clientId, Username: email, ConfirmationCode: code, Password: newPassword, SecretHash: this.secretHash(email) }),
      );
    } catch (error: any) {
      // A wrong code, an expired one and an unknown account are the same answer
      throw new BadRequestException('Invalid or expired code');
    }
    // Whoever had the old password loses access: revoke every refresh token of the account
    await this.client.send(new AdminUserGlobalSignOutCommand({ UserPoolId: this.poolId, Username: email })).catch((error: any) => {
      this.logger.warn(`Could not close the sessions after a password reset: ${error?.message}`);
    });
  }

  async updatePassword(userId: string, newPassword: string): Promise<void> {
    try {
      await this.client.send(new AdminSetUserPasswordCommand({ UserPoolId: this.poolId, Username: userId, Password: newPassword, Permanent: true }));
    } catch (error: any) {
      throw new BadRequestException(`Failed to update password: ${error?.message}`);
    }
  }

  /** Nothing to do: the email is already verified in Cognito (the real confirmation lives in the database of `auth`) */
  async verifyUserEmail(_userId: string): Promise<void> {}

  async deleteUser(userId: string): Promise<void> {
    try {
      await this.client.send(new AdminDeleteUserCommand({ UserPoolId: this.poolId, Username: userId }));
    } catch (error: any) {
      throw new BadRequestException(`Failed to delete user: ${error?.message}`);
    }
  }

  async setUserBanned(userId: string, banned: boolean): Promise<void> {
    try {
      const command = banned ? AdminDisableUserCommand : AdminEnableUserCommand;
      await this.client.send(new command({ UserPoolId: this.poolId, Username: userId }));
    } catch (error: any) {
      throw new BadRequestException(`Failed to ${banned ? 'ban' : 'unban'} user: ${error?.message}`);
    }
  }
}
