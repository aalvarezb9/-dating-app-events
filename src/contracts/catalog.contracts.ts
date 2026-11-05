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

/** A pause inside a working day ('HH:mm', business time zone): nothing can be booked across it */
export interface DayBreakContract {
  start: string;
  end: string;
}

export interface WeeklyHoursContract {
  [day: string]: { open: string; close: string; closed: boolean; breaks?: DayBreakContract[] } | undefined;
}

/** Days off (holidays, vacations): local dates 'YYYY-MM-DD' in the business time zone, both ends included */
export interface DateRangeContract {
  from: string;
  to: string;
  reason?: string | null;
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
  /**
   * Login account of the member. Team members are the people who attend customers and have NO login,
   * except the owner when they attend too (then it is the owner's user id); null otherwise.
   */
  userId: string | null;
  displayName: string;
  title: string | null;
  bio: string | null;
  profilePhotoUrl: string | null;
  specialties: string[] | null;
  isAvailable: boolean;
  /** Days and hours the member works ('closed' = does not work that day); null = follows the business hours */
  workingHours: WeeklyHoursContract | null;
  /** Days the member is away (vacations, leave); optional so older publishers keep working */
  timeOff?: DateRangeContract[] | null;
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
  /** Days the whole business is closed (holidays, vacations); optional so older publishers keep working */
  closures?: DateRangeContract[] | null;
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
