import { DomainEventType } from '../types/events';

/**
 * Where a notification is delivered. `ALL` is not a channel of its own: the notifications service
 * splits it into the channels the recipient can actually be reached by (see `channelsFor`).
 */
export enum NotificationChannel {
  EMAIL = 'EMAIL',
  PUSH = 'PUSH',
  UI = 'UI',
  SSE = 'SSE',
  ALL = 'ALL',
}

/** The channels a message can be delivered through (everything but `ALL`) */
export const DELIVERY_CHANNELS = [
  NotificationChannel.EMAIL,
  NotificationChannel.PUSH,
  NotificationChannel.UI,
  NotificationChannel.SSE,
] as const;

export type DeliveryChannel = (typeof DELIVERY_CHANNELS)[number];

/** One Kafka topic per channel: a slow email provider must not hold back the in-app notifications */
export const NOTIFICATION_TOPICS: Record<NotificationChannel, DomainEventType> = {
  [NotificationChannel.EMAIL]: DomainEventType.NOTIFICATION_EMAIL,
  [NotificationChannel.PUSH]: DomainEventType.NOTIFICATION_PUSH,
  [NotificationChannel.UI]: DomainEventType.NOTIFICATION_UI,
  [NotificationChannel.SSE]: DomainEventType.NOTIFICATION_SSE,
  [NotificationChannel.ALL]: DomainEventType.NOTIFICATION_ALL,
};

/**
 * - `transactional`: the person needs it to use the product (verify email, link of an appointment,
 *   security). It ignores the preferences of the person.
 * - `reminder`: useful but optional (an appointment is about to start).
 * - `marketing`: promotions; always opt-in.
 */
export type NotificationCategory = 'transactional' | 'reminder' | 'marketing';

export const NOTIFICATION_CATEGORIES: readonly NotificationCategory[] = ['transactional', 'reminder', 'marketing'];

/** Who receives it: at least what the chosen channel needs (see `validateNotificationMessage`) */
export interface NotificationRecipient {
  /** A registered account: needed for the in-app, SSE and (unless tokens are given) push channels */
  userId?: string;
  tenantId?: string;
  /** Needed for email (a guest has no account, only this) */
  email?: string;
  /** How to greet the person in the template ("Ana") */
  name?: string;
  /** Push only: explicit device tokens; without them the tokens registered by `userId` are used */
  deviceTokens?: string[];
}

/** A file stored in the storage service; it travels by reference, never as bytes */
export interface NotificationAttachment {
  filename: string;
  mimeType: string;
  bucket: string;
  path: string;
}

/** Content rendered from a template that lives in the notifications service */
export interface NotificationTemplateContent {
  key: string;
  /** Default `es` */
  locale?: string;
  data: Record<string, unknown>;
}

/** Content written by the emitter, with no template */
export interface NotificationRawContent {
  /** Required for email */
  subject?: string;
  /** Title of a push / in-app notification */
  title?: string;
  body: string;
  /** Optional HTML version for email */
  html?: string;
}

/**
 * The command published to Kafka. Exactly one of `template` and `raw` carries the content.
 *
 * `sensitiveFields` lists dotted paths inside the message (`template.data.link`) that are secrets:
 * the notifications service never writes them to its delivery log.
 */
export interface NotificationMessage {
  /** UUID; with the channel, the idempotency key of the delivery */
  id: string;
  channel: NotificationChannel;
  recipient: NotificationRecipient;
  template?: NotificationTemplateContent;
  raw?: NotificationRawContent;
  attachments?: NotificationAttachment[];
  category: NotificationCategory;
  sensitiveFields?: string[];
  /** `ALL` only: deliver through these channels instead of every channel the recipient can be reached by */
  channels?: DeliveryChannel[];
  /** ISO date-time */
  occurredAt: string;
  /** The service that asked for it (`backend-dating-schedule`) */
  source: string;
  /** Traces the notification back to what caused it */
  correlationId?: string;
}

export const MAX_ATTACHMENTS = 5;
export const MAX_BODY_LENGTH = 20_000;
export const MAX_SUBJECT_LENGTH = 200;
