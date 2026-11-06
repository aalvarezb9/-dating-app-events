/**
 * Contracts of the confirmation of an email (event version 1). Emitted by backend-dating-auth through
 * its outbox.
 *
 * - EMAIL_VERIFICATION_REQUESTED: a new account (or a request to send the link again) needs its email
 *   confirmed. Whoever sends the email (backend-dating-notifications) builds the link from the plain
 *   `token`, which travels ONLY here: auth stores its hash, so a link that was not delivered cannot be
 *   recovered, only replaced (a newer token revokes the previous ones).
 * - EMAIL_VERIFIED: the person proved the email is theirs. Whoever keeps data tied to an email (schedule
 *   links the appointments a guest booked with it) can trust it from this moment on.
 */
export interface EmailVerificationRequestedData {
  userId: string;
  /** Tenant of the account (a business, or the own tenant of a customer) */
  tenantId: string;
  role: string;
  email: string;
  firstName: string | null;
  /** Why the token was issued: the account was just created, or the person asked to send it again */
  reason: 'registered' | 'resent';
  /** Secret of the link. Treat it like a password: never log it */
  token: string;
  /** The token stops working at this instant (ISO) */
  expiresAt: string;
}

export interface EmailVerifiedData {
  userId: string;
  tenantId: string;
  /** `business` or `customer` */
  tenantType: string;
  role: string;
  /** Normalized to lower case: it is the key to match data tied to the email */
  email: string;
  verifiedAt: string;
}
