/**
 * Event contracts of the catalog entities owned by backend-dating-business-owner and consumed
 * (as local projections or cache invalidations) by schedule, users and any other service.
 *
 * Visibility level of these payloads: INTERNAL (other services). Owner-only data never leaves
 * the owner: bank account, legal/identity documents, tax id, subscription billing.
 *
 * Rules: only ADD fields (never rename/remove); a breaking change is published as a new
 * event type next to the old one until every consumer migrates.
 */

/** Base of every *_UPSERTED / *_DELETED payload (`event.data`) */
export interface ProjectionPayload {
  /** Id of the row in the owner service (the projection uses the same id) */
  id: string;
  /** Tenant that owns the row */
  tenantId: string;
  /**
   * Monotonic version of the row (epoch milliseconds of modified_at). A consumer ignores an
   * event whose sourceVersion is not newer than the one it already holds.
   */
  sourceVersion: number;
}

export interface WeeklyHoursContract {
  [day: string]: { open: string; close: string; closed: boolean } | undefined;
}

/** SERVICE_UPSERTED / SERVICE_DELETED */
export interface ServiceContract extends ProjectionPayload {
  name: string;
  description: string | null;
  durationMinutes: number;
  price: number;
  currency: string;
  isActive: boolean;
  imageUrl: string | null;
  maxAdvanceBookingDays: number;
  minAdvanceBookingHours: number;
  /** Optional daily availability window ('HH:mm', business time zone) */
  startTime: string | null;
  endTime: string | null;
}

/** TEAM_MEMBER_UPSERTED / TEAM_MEMBER_DELETED */
export interface TeamMemberContract extends ProjectionPayload {
  /** Login account of the member (internal consumers only: staff scope) */
  userId: string;
  displayName: string;
  title: string | null;
  bio: string | null;
  profilePhotoUrl: string | null;
  specialties: string[] | null;
  isAvailable: boolean;
  workingHours: WeeklyHoursContract | null;
  /** Services the member offers; empty/null = offers every service */
  serviceIds: string[] | null;
  ratingAvg: number;
  ratingCount: number;
  displayOrder: number;
  showOnLanding: boolean;
}

/** BUSINESS_PROFILE_UPSERTED */
export interface BusinessProfileContract extends ProjectionPayload {
  businessName: string;
  subdomain: string | null;
  /** Business type chosen at registration (plain id, no cross-service foreign key) */
  businessTypeId: string | null;
  /** IANA time zone in which business hours and service windows are read; null = platform default */
  timezone: string | null;
  businessHours: WeeklyHoursContract | null;
  cancellationRules: { hoursBefore: number; refundPercentage: number; rescheduleAllowed: boolean } | null;
  logoUrl: string | null;
  coverImageUrl: string | null;
  subscriptionStatus: string | null;
}

/** LANDING_PAGE_UPSERTED: cache invalidation only (consumers fetch the document by key) */
export interface LandingPageChangedContract {
  tenantId: string;
  sourceVersion: number;
}

/** REVIEW_UPSERTED: cache invalidation for review lists and summaries */
export interface ReviewChangedContract extends ProjectionPayload {
  reviewedTenantId: string;
  reviewerType: string;
  rating: number;
  isPublic: boolean;
}
