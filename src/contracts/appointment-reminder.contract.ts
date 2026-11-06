/**
 * Contract of APPOINTMENT_REMINDER (event version 1).
 *
 * Emitted by backend-dating-schedule (through its outbox), once per appointment, when a confirmed
 * appointment is about to start (`APPOINTMENT_REMINDER_HOURS_BEFORE`). Whoever sends the email
 * (backend-dating-notifications) reads everything it needs from here; the access link to see, move
 * or cancel the appointment travels in APPOINTMENT_ACCESS_LINK_ISSUED, not here.
 */
export interface AppointmentReminderData {
  appointmentId: string;
  tenantId: string;
  businessName: string | null;
  subdomain: string | null;
  serviceId: string;
  teamMemberId: string | null;
  scheduledAt: string;
  scheduledEndAt: string;
  status: string;
  /** Who attends: the email is where the reminder goes */
  customer: { name: string; email: string; phone: string };
}
