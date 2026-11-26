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
  /**
   * Seats per session: how many customers can book the same start of this service (a yoga class, a
   * workshop). 1 = a normal service, one customer per slot. Optional so older publishers keep working:
   * a copy without it means 1.
   */
  capacity?: number;
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
  /** The branch where the person works when no assignment says otherwise (null = the main branch); optional so older publishers keep working */
  homeBranchId?: string | null;
}

/** The place of a branch (the same shape as the address a business registers with) */
export interface BranchAddressContract {
  street: string;
  city: string;
  state: string;
  country: string;
  zipcode: string;
  lat: number;
  lng: number;
}

/**
 * A service as one branch offers it. `price` and `durationMinutes` are what the branch charges and takes: null = the service's own
 * (the consumer reads them from its copy of the service, so a change of the service reaches the branch that inherits it).
 */
export interface BranchServiceContract {
  serviceId: string;
  price: number | null;
  durationMinutes: number | null;
  isActive: boolean;
}

/**
 * BRANCH_UPSERTED / BRANCH_DELETED: a branch of the business (the same subdomain, another place). The main branch is the one the business
 * registered with; a business with only that one has no branch to show. The services it offers travel inside it.
 */
export interface BranchContract extends ProjectionPayload {
  name: string;
  photoUrl: string | null;
  address: BranchAddressContract;
  phone: string | null;
  /** Hours of the branch; null = follows the business hours */
  businessHours: WeeklyHoursContract | null;
  /** Days this branch is closed (besides the closures of the whole business) */
  closures?: DateRangeContract[] | null;
  isMain: boolean;
  isActive: boolean;
  displayOrder: number;
  services: BranchServiceContract[];
}

/**
 * TEAM_ASSIGNMENT_UPSERTED / TEAM_ASSIGNMENT_DELETED: on a local date ('YYYY-MM-DD', business time zone) a person works at one branch
 * between two times ('HH:mm'). A date with assignments replaces the usual week of that person: they are only available in those windows.
 */
export interface TeamAssignmentContract extends ProjectionPayload {
  teamMemberId: string;
  branchId: string;
  date: string;
  startTime: string;
  endTime: string;
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
  /** Minutes a person needs to go from one branch to another: the least between two appointments at different branches (0 = no gap); optional so older publishers keep working */
  branchTravelMinutes?: number;
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
