import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Strategy as PassportBaseStrategy } from 'passport-strategy';
import { SharedConfigService } from '../../config/env.config';
import { isAdminSessionAuthorized } from '../admin-session';
import { isSupportSessionOpen } from '../support-session';
import { TenantBlockCache, tenantBlockedWith } from '../tenant-block';
import { TokenVerifier } from '../token-verifier';
import { userBlockedWith } from '../user-block';

/**
 * Passport strategy of the tokens of Cognito and of the support sessions (see `TokenVerifier`). It is registered as `jwt`
 * by `AuthModule`, the name the guard asks for. It does NOT call the identity provider: services have no permission on
 * Cognito, so what Supabase answered ("does the user still exist") is a flag in Redis that `auth` writes (see `user-block.ts`).
 *
 * After the signature, the checks that depend on the state of the platform are the same as ever:
 * blocked tenant (403), second factor of an administrator (401) and support session still open (401).
 */
@Injectable()
export class CognitoJwtStrategy extends PassportBaseStrategy {
  readonly name = 'jwt';
  private readonly verifier: TokenVerifier;

  constructor(
    config: SharedConfigService,
    private readonly cache?: TenantBlockCache,
  ) {
    super();
    // What `PassportStrategy` of Nest does for the other strategies: make it available to `AuthGuard('jwt')`
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('passport').use(this.name, this);
    const cognito = config.cognito;
    this.verifier = new TokenVerifier({
      cognito: { issuer: cognito.issuer, jwksUrl: cognito.jwksUrl, clientId: cognito.clientId },
      support: { secret: config.supportTokenSecret },
    });
  }

  /** Called by passport on every request */
  authenticate(req: any): void {
    const header: string | undefined = req.headers?.authorization;
    const match = header?.match(/^Bearer (.+)$/i);
    if (!match) {
      return this.fail('No auth token', 401);
    }
    this.validateToken(match[1]).then(
      (user) => this.success(user),
      (error) => (error instanceof ForbiddenException || error instanceof UnauthorizedException ? this.error(error) : this.fail(error?.message ?? 'Invalid token', 401)),
    );
  }

  async validateToken(token: string) {
    const claims = await this.verifier.verify(token); // InvalidTokenError -> 401 in authenticate

    // Not cached in memory: a suspension or a ban must cut the sessions right away
    const blockedWith = await tenantBlockedWith(this.cache, claims.tenantId);
    if (blockedWith) {
      throw new ForbiddenException(`account.error.tenant_${blockedWith}`);
    }
    if (await userBlockedWith(this.cache, claims.userId)) {
      throw new UnauthorizedException('Invalid token');
    }

    // A super administrator needs the second factor: a session that auth did not record after the code was right is refused
    if (claims.role === 'super_admin' && !(await isAdminSessionAuthorized(this.cache, claims.sessionId))) {
      throw new UnauthorizedException('admin.error.second_factor_required');
    }

    // A support session: auth must have opened it, and it can never be the token of an administrator
    if (claims.impersonatedBy && (claims.role === 'super_admin' || !(await isSupportSessionOpen(this.cache, claims.sessionId)))) {
      throw new UnauthorizedException('support.error.session_ended');
    }

    return {
      userId: claims.userId,
      email: claims.email,
      tenantId: claims.tenantId,
      tenantType: claims.tenantType,
      role: claims.role,
      sessionId: claims.sessionId,
      impersonatedBy: claims.impersonatedBy,
      supportMode: claims.impersonatedBy ? claims.supportMode : undefined,
    };
  }
}
