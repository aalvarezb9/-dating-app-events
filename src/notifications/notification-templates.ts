/**
 * The templates the notifications service can render, with the data each one needs.
 *
 * It is the contract between whoever asks for a notification and whoever renders it: asking for
 * `APPOINTMENT_CONFIRMED` without `startsAt` does not compile. Dates travel as ISO strings and the
 * template formats them in the time zone of the business (`timezone`).
 *
 * To add a template: add its key and data here, write `templates/<locale>/<KEY>.hbs` in
 * backend-dating-notifications (a test fails if a key has no file), and emit it.
 */
export interface NotificationTemplateCatalog {
  /** Confirm the email of a new account. `link` carries the token: mark it as sensitive. */
  EMAIL_VERIFICATION: { name?: string; link: string; expiresAt: string };

  /** The personal link of an appointment (see it, move it, cancel it, pay it). `link` carries the token. */
  APPOINTMENT_ACCESS_LINK: {
    attendeeName?: string;
    businessName: string;
    serviceName: string;
    startsAt: string;
    timezone: string;
    link: string;
  };

  APPOINTMENT_CONFIRMED: {
    attendeeName?: string;
    businessName: string;
    serviceName: string;
    startsAt: string;
    timezone: string;
    link?: string;
  };

  APPOINTMENT_CANCELLED: {
    attendeeName?: string;
    businessName: string;
    serviceName: string;
    startsAt: string;
    timezone: string;
    /** Who cancelled it, so the text can say "the business cancelled" or "you cancelled" */
    cancelledBy: 'business' | 'customer' | 'system';
    reason?: string;
    /** 0-100; only when something paid is owed back */
    refundPercentage?: number;
  };

  APPOINTMENT_RESCHEDULED: {
    attendeeName?: string;
    businessName: string;
    serviceName: string;
    previousStartsAt: string;
    startsAt: string;
    timezone: string;
    link?: string;
  };

  APPOINTMENT_REMINDER: {
    attendeeName?: string;
    businessName: string;
    serviceName: string;
    startsAt: string;
    timezone: string;
    link?: string;
  };

  /** The owner rejected the proof of a bank transfer; the customer gets a new window to send another one */
  PAYMENT_PROOF_REJECTED: {
    attendeeName?: string;
    businessName: string;
    serviceName: string;
    reason: string;
    /** When the new window to pay ends */
    reservationExpiresAt?: string;
    timezone: string;
    link?: string;
  };
}

export type NotificationTemplateKey = keyof NotificationTemplateCatalog;

/** `{ key: 'APPOINTMENT_CONFIRMED', data: {...} }` with the data of that very template */
export type TypedTemplate = {
  [K in NotificationTemplateKey]: { key: K; data: NotificationTemplateCatalog[K]; locale?: string };
}[NotificationTemplateKey];

/** The keys of the catalog, for the checks that every key has a file (the catalog is an interface: no runtime list) */
export const NOTIFICATION_TEMPLATE_KEYS: readonly NotificationTemplateKey[] = [
  'EMAIL_VERIFICATION',
  'APPOINTMENT_ACCESS_LINK',
  'APPOINTMENT_CONFIRMED',
  'APPOINTMENT_CANCELLED',
  'APPOINTMENT_RESCHEDULED',
  'APPOINTMENT_REMINDER',
  'PAYMENT_PROOF_REJECTED',
];
