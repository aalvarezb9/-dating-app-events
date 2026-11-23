import { createRemoteJWKSet, decodeJwt, jwtVerify } from 'jose';

/** `iss` of the tokens of a support session, which `auth` signs itself (see `SupportTokenService`) */
export const SUPPORT_TOKEN_ISSUER = 'bookly-support';

/** Who a valid token says is acting, in the one shape the rest of the platform reads (whatever the issuer) */
export interface VerifiedToken {
  userId: string;
  email?: string;
  tenantId?: string;
  tenantType?: string;
  role?: string;
  /** Id of the session: the second factor of an administrator and a support session are recorded in Redis under it */
  sessionId?: string;
  /** Present only in a support session: the super administrator who acts as `userId` */
  impersonatedBy?: string;
  supportMode?: string;
}

export interface TokenVerifierOptions {
  /** The User Pool of Cognito: tokens of every person who logs in */
  cognito: { issuer: string; jwksUrl: string; clientId: string };
  /** The tokens `auth` signs for a support session (HS256, a secret of their own) */
  support: { secret: string };
  /** Seconds of difference between clocks that `exp` and `nbf` tolerate */
  clockToleranceSeconds?: number;
}

export class InvalidTokenError extends Error {}

/**
 * Verifies an access token that comes from one of TWO issuers, with a single entry:
 *
 * 1. It reads `iss` WITHOUT trusting it (only to choose the way to verify).
 * 2. A token of Cognito is verified with RS256 and the public key of the User Pool (JWKS, cached by `jose`). A token of a support session
 *    is verified with HS256 and `SUPPORT_TOKEN_SECRET`.
 * 3. Each way fixes its OWN algorithm and its OWN key: a token that says it is a support one is never checked with the key of Cognito,
 *    nor the other way round (that is the confusion of algorithms: signing with the public key as if it were a secret).
 *
 * The checks that depend on the state of the platform (blocked tenant, second factor, support session still open) are not here:
 * they are in Redis and each service does them after this.
 */
export class TokenVerifier {
  private readonly keys;
  private readonly supportKey: Uint8Array;
  /** What both ways require: an expiry and a subject (a token without them is refused) */
  private readonly common: { requiredClaims: string[]; clockTolerance?: number };

  constructor(private readonly options: TokenVerifierOptions) {
    this.keys = createRemoteJWKSet(new URL(options.cognito.jwksUrl));
    this.supportKey = new TextEncoder().encode(options.support.secret);
    this.common = { requiredClaims: ['exp', 'sub'], ...(options.clockToleranceSeconds !== undefined ? { clockTolerance: options.clockToleranceSeconds } : {}) };
  }

  async verify(token: string): Promise<VerifiedToken> {
    let issuer: unknown;
    try {
      issuer = decodeJwt(token).iss;
    } catch {
      throw new InvalidTokenError('not a token');
    }

    try {
      if (issuer === SUPPORT_TOKEN_ISSUER) {
        const { payload } = await jwtVerify(token, this.supportKey, { algorithms: ['HS256'], issuer: SUPPORT_TOKEN_ISSUER, ...this.common });
        return this.fromSupport(payload);
      }
      if (issuer === this.options.cognito.issuer) {
        const { payload } = await jwtVerify(token, this.keys, { algorithms: ['RS256'], issuer: this.options.cognito.issuer, ...this.common });
        return this.fromCognito(payload);
      }
    } catch (error: any) {
      throw new InvalidTokenError(error?.code ?? error?.message ?? 'invalid token');
    }
    throw new InvalidTokenError('unknown issuer');
  }

  private fromCognito(payload: Record<string, any>): VerifiedToken {
    // A Cognito token is an ACCESS token of OUR app client: an id token or one of another client is not
    if (payload.token_use !== 'access' || payload.client_id !== this.options.cognito.clientId) {
      throw new InvalidTokenError('not an access token of this client');
    }
    // The trigger of the User Pool copies the attributes of the user into the token: as `custom:*`, or with their own name
    const claim = (name: string): string | undefined => payload[`custom:${name}`] ?? payload[name] ?? undefined;
    return {
      userId: payload.sub as string,
      email: payload.email,
      tenantId: claim('tenantId'),
      tenantType: claim('tenantType'),
      role: claim('role'),
      // `origin_jti` stays the same across refreshes of one login; `jti` changes with every access token
      sessionId: payload.session_id ?? payload.origin_jti ?? payload.jti,
    };
  }

  private fromSupport(payload: Record<string, any>): VerifiedToken {
    const meta = payload.app_metadata ?? {};
    return {
      userId: payload.sub as string,
      email: payload.email,
      tenantId: meta.tenantId,
      tenantType: meta.tenantType,
      role: meta.role,
      sessionId: payload.session_id,
      impersonatedBy: meta.impersonatedBy,
      supportMode: meta.supportMode,
    };
  }
}
