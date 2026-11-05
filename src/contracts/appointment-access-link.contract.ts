/**
 * Contract of APPOINTMENT_ACCESS_LINK_ISSUED (event version 1).
 *
 * Emitted by backend-dating-schedule (through its outbox) when an appointment is created and every
 * time the business asks to send the link again. The link is the address where the person who will
 * attend sees the appointment and can move or cancel it: `https://<subdomain>.<BASE_DOMAIN>/<token>`.
 *
 * Whoever sends the email (backend-dating-notifications) reads everything it needs from here.
 * The plain token travels ONLY in this event: schedule stores just its hash, so a link that was not
 * delivered cannot be recovered, only replaced (`reason: 'resent'` revokes the previous one).
 */
export interface AppointmentAccessLinkIssuedData {
  appointmentId: string;
  tenantId: string;
  /** Why this link was issued: a new appointment, or the business asked to send it again */
  reason: 'created' | 'resent';
  /**
   * Complete address of the page, or null when the business has not published its subdomain yet
   * (then only `token` identifies the link and the sender cannot build the address).
   */
  url: string | null;
  /** Secret of the link (the last segment of `url`). Treat it like a password: never log it */
  token: string;
  /** The link stops working when the appointment ends */
  expiresAt: string;
  businessName: string | null;
  subdomain: string | null;
  serviceId: string;
  teamMemberId: string | null;
  scheduledAt: string;
  scheduledEndAt: string;
  status: string;
  /** Who attends: the email is where the notification goes */
  customer: { name: string; email: string; phone: string };
}
