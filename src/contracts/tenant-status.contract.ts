/**
 * Contract of the events about the approval of a tenant (event version 1), emitted by
 * backend-dating-auth through its outbox when the status of a tenant changes:
 * BUSINESS_REQUEST_APPROVED (pending -> active), BUSINESS_REQUEST_REJECTED (-> rejected),
 * BUSINESS_SUSPENDED (-> suspended) and BUSINESS_REACTIVATED (suspended -> active).
 *
 * Whoever notifies the owner (backend-dating-notifications) reads everything it needs from here.
 */
export interface TenantStatusChangedData {
  tenantId: string;
  previousStatus: string;
  status: string;
  /** Why (rejection or suspension); null when the change needs no explanation */
  reason: string | null;
  owner: { userId: string; email: string; firstName: string | null; lastName: string | null } | null;
  /** Who made the change (the admin, or `system`) */
  changedBy: string;
}
