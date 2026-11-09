import {
  DELIVERY_CHANNELS,
  DeliveryChannel,
  MAX_ATTACHMENTS,
  MAX_BODY_LENGTH,
  MAX_SIGNAL_BYTES,
  MAX_SUBJECT_LENGTH,
  NOTIFICATION_CATEGORIES,
  NotificationChannel,
  NotificationMessage,
  NotificationRecipient,
} from './notification.contract';
import { validateTopic } from '../sse/sse.topics';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TEMPLATE_KEY_PATTERN = /^[A-Z][A-Z0-9_]*$/;
/** A secret can only be inside the content: `template.data.link`, `raw.body`… */
const SENSITIVE_PATH_PATTERN = /^(template\.data|raw)(\.[A-Za-z0-9_]+)+$/;

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const isText = (value: unknown, max = Infinity): value is string => typeof value === 'string' && value.trim().length > 0 && value.length <= max;

/**
 * Whether a recipient can be reached through a channel, with what is in the message itself.
 * (The notifications service can know more: the devices registered for a `userId`, for instance.)
 */
export function canReach(recipient: NotificationRecipient, channel: DeliveryChannel): boolean {
  switch (channel) {
    case NotificationChannel.EMAIL:
      // A guest gives the address; an account can give only its id and the service asks auth for the address
      return (typeof recipient.email === 'string' && EMAIL_PATTERN.test(recipient.email)) || Boolean(recipient.userId);
    case NotificationChannel.PUSH:
      return Boolean(recipient.userId) || (recipient.deviceTokens?.length ?? 0) > 0;
    case NotificationChannel.UI:
      return Boolean(recipient.userId);
    case NotificationChannel.SSE:
      // The SSE channel delivers SIGNALS to whoever listens to a topic, not messages to a person: no recipient
      // reaches it, so an `ALL` never goes through it (a signal is ordered to the SSE channel on purpose)
      return false;
  }
}

/** The channels an `ALL` message goes through: the requested ones, or every one the recipient can be reached by */
export function channelsFor(message: Pick<NotificationMessage, 'recipient' | 'channels'>): DeliveryChannel[] {
  const wanted = message.channels?.length ? message.channels : [...DELIVERY_CHANNELS];
  return wanted.filter((channel) => canReach(message.recipient, channel));
}

/**
 * Everything that must be true for the notifications service to be able to deliver the message.
 * Pure (no Nest, no Kafka) so the emitter checks it before publishing and the service checks it again
 * when consuming: nothing coming from Kafka is trusted.
 *
 * @returns the problems found; empty when the message is valid
 */
export function validateNotificationMessage(message: unknown): string[] {
  if (!isObject(message)) {
    return ['the message must be an object'];
  }
  const errors: string[] = [];
  const m = message as Partial<NotificationMessage> & Record<string, unknown>;

  if (typeof m.id !== 'string' || !UUID_PATTERN.test(m.id)) errors.push('id must be a UUID');
  if (!Object.values(NotificationChannel).includes(m.channel as NotificationChannel)) errors.push('channel is not valid');
  if (!NOTIFICATION_CATEGORIES.includes(m.category as never)) errors.push('category is not valid');
  if (typeof m.occurredAt !== 'string' || Number.isNaN(Date.parse(m.occurredAt))) errors.push('occurredAt must be an ISO date-time');
  if (!isText(m.source)) errors.push('source is required');

  const recipient = m.recipient;
  if (!isObject(recipient)) {
    errors.push('recipient is required');
  } else {
    if (recipient.userId !== undefined && !(typeof recipient.userId === 'string' && UUID_PATTERN.test(recipient.userId))) errors.push('recipient.userId must be a UUID');
    if (recipient.tenantId !== undefined && !(typeof recipient.tenantId === 'string' && UUID_PATTERN.test(recipient.tenantId))) errors.push('recipient.tenantId must be a UUID');
    if (recipient.email !== undefined && !(typeof recipient.email === 'string' && EMAIL_PATTERN.test(recipient.email))) errors.push('recipient.email is not a valid email');
    if (recipient.deviceTokens !== undefined && !(Array.isArray(recipient.deviceTokens) && recipient.deviceTokens.every((t) => isText(t)))) errors.push('recipient.deviceTokens must be a list of tokens');
  }

  // Content: exactly one of template / raw / signal; a signal is the content of the SSE channel and of no other
  const hasTemplate = m.template !== undefined;
  const hasRaw = m.raw !== undefined;
  const hasSignal = m.signal !== undefined;
  if ([hasTemplate, hasRaw, hasSignal].filter(Boolean).length !== 1) {
    errors.push('exactly one of template, raw and signal is required');
  }
  if (hasSignal !== (m.channel === NotificationChannel.SSE)) {
    errors.push(hasSignal ? 'a signal can only go through the SSE channel' : 'the SSE channel delivers a signal');
  }
  if (hasSignal) {
    const signal = m.signal;
    if (!isObject(signal)) {
      errors.push('signal must be an object');
    } else {
      const topicProblem = validateTopic(signal.topic);
      if (topicProblem) errors.push(`signal.topic: ${topicProblem}`);
      if (!isObject(signal.data)) errors.push('signal.data must be an object');
      else if (Buffer.byteLength(JSON.stringify(signal.data)) > MAX_SIGNAL_BYTES) errors.push(`signal.data is bigger than ${MAX_SIGNAL_BYTES} bytes`);
    }
  }
  if (hasTemplate) {
    const template = m.template;
    if (!isObject(template)) {
      errors.push('template must be an object');
    } else {
      if (typeof template.key !== 'string' || !TEMPLATE_KEY_PATTERN.test(template.key)) errors.push('template.key must be UPPER_SNAKE_CASE');
      if (!isObject(template.data)) errors.push('template.data must be an object');
      if (template.locale !== undefined && !(typeof template.locale === 'string' && /^[a-z]{2}(-[A-Z]{2})?$/.test(template.locale))) errors.push('template.locale is not valid');
    }
  }
  if (hasRaw) {
    const raw = m.raw;
    if (!isObject(raw)) {
      errors.push('raw must be an object');
    } else {
      if (!isText(raw.body, MAX_BODY_LENGTH)) errors.push('raw.body is required');
      if (raw.subject !== undefined && !isText(raw.subject, MAX_SUBJECT_LENGTH)) errors.push('raw.subject is not valid');
      if (raw.title !== undefined && !isText(raw.title, MAX_SUBJECT_LENGTH)) errors.push('raw.title is not valid');
      if (raw.html !== undefined && !isText(raw.html, MAX_BODY_LENGTH)) errors.push('raw.html is not valid');
      if (m.channel === NotificationChannel.EMAIL && !isText(raw.subject, MAX_SUBJECT_LENGTH)) errors.push('raw.subject is required for email');
      // ALL reaches every channel the person can be reached by, and each one needs its own part
      if (m.channel === NotificationChannel.ALL && (!isText(raw.subject, MAX_SUBJECT_LENGTH) || !isText(raw.title, MAX_SUBJECT_LENGTH))) {
        errors.push('raw.subject and raw.title are required for ALL');
      }
      if ([NotificationChannel.PUSH, NotificationChannel.UI].includes(m.channel as NotificationChannel) && !isText(raw.title, MAX_SUBJECT_LENGTH)) {
        errors.push('raw.title is required for push and UI');
      }
    }
  }

  // What the channel needs from the recipient
  if (isObject(recipient)) {
    const target = recipient as NotificationRecipient;
    if (m.channel === NotificationChannel.ALL) {
      const requested = m.channels;
      if (requested !== undefined && !(Array.isArray(requested) && requested.length > 0 && requested.every((c) => (DELIVERY_CHANNELS as readonly string[]).includes(c)))) {
        errors.push('channels must be a non-empty list of EMAIL, PUSH, UI or SSE');
      } else if (channelsFor({ recipient: target, channels: requested as DeliveryChannel[] | undefined }).length === 0) {
        errors.push('the recipient cannot be reached through any of the channels (give an email or a userId)');
      }
    } else if (
      m.channel !== NotificationChannel.SSE && // a signal has no recipient
      (DELIVERY_CHANNELS as readonly string[]).includes(m.channel as string) &&
      !canReach(target, m.channel as DeliveryChannel)
    ) {
      errors.push(`the recipient cannot be reached through ${m.channel} (${neededFor(m.channel as DeliveryChannel)})`);
    }
  }

  // Attachments: by reference, email only
  if (m.attachments !== undefined) {
    if (!Array.isArray(m.attachments) || m.attachments.length > MAX_ATTACHMENTS) {
      errors.push(`attachments must be a list of at most ${MAX_ATTACHMENTS}`);
    } else {
      if (m.channel !== NotificationChannel.EMAIL && m.channel !== NotificationChannel.ALL) errors.push('attachments are only allowed for email');
      m.attachments.forEach((file, index) => {
        if (!isObject(file) || !isText(file.filename) || /[\\/]/.test(String(file.filename)) || !isText(file.mimeType) || !isText(file.bucket) || !isText(file.path)) {
          errors.push(`attachments[${index}] needs a plain filename, mimeType, bucket and path`);
        }
      });
    }
  }

  if (m.sensitiveFields !== undefined) {
    if (!Array.isArray(m.sensitiveFields) || !m.sensitiveFields.every((p) => typeof p === 'string' && SENSITIVE_PATH_PATTERN.test(p))) {
      errors.push('sensitiveFields must be paths inside template.data or raw');
    }
  }

  return errors;
}

function neededFor(channel: DeliveryChannel): string {
  switch (channel) {
    case NotificationChannel.EMAIL:
      return 'recipient.email or recipient.userId is required';
    case NotificationChannel.PUSH:
      return 'recipient.userId or recipient.deviceTokens is required';
    default:
      return 'recipient.userId is required';
  }
}
