import { randomUUID } from 'crypto';
import { Injectable, Logger } from '@nestjs/common';
import { DomainEvent } from '../types/events';
import { EventPublisher } from '../services/event-publisher.service';
import { SharedConfigService } from '../config/env.config';
import {
  DeliveryChannel,
  NOTIFICATION_TOPICS,
  NotificationAttachment,
  NotificationCategory,
  NotificationChannel,
  NotificationMessage,
  NotificationRawContent,
  NotificationRecipient,
} from './notification.contract';
import { TypedTemplate } from './notification-templates';
import { validateNotificationMessage } from './notification.validation';

/** What an emitter gives: the content (a typed template OR raw text), the recipient and the category */
export type NotificationInput = {
  recipient: NotificationRecipient;
  category: NotificationCategory;
  attachments?: NotificationAttachment[];
  /** Paths inside the message that are secrets (`template.data.link`): the delivery log never stores them */
  sensitiveFields?: string[];
  /** `ALL` only: restrict the channels */
  channels?: DeliveryChannel[];
  correlationId?: string;
  /** Give it to make an emit repeatable (retrying the same business operation must not notify twice) */
  id?: string;
} & ({ template: TypedTemplate; raw?: never } | { raw: NotificationRawContent; template?: never });

/** Builds the message of an emit: adds the id, the time and the sender. Pure, so it can be tested without Kafka. */
export function buildNotificationMessage(channel: NotificationChannel, input: NotificationInput, source: string): NotificationMessage {
  const { id, template, raw, ...rest } = input;
  return {
    ...rest,
    id: id ?? randomUUID(),
    channel,
    ...(template ? { template } : {}),
    ...(raw ? { raw } : {}),
    occurredAt: new Date().toISOString(),
    source,
  };
}

/**
 * Orders the notifications service to notify somebody: `notifications.emit(NotificationChannel.EMAIL, {...})`.
 *
 * It publishes a COMMAND to Kafka (one topic per channel) and does not wait for the delivery: the
 * emitter says what and to whom, the notifications service decides how and when, retries and logs.
 *
 * It is fire-and-forget by design (it does not go through the outbox): a notification lost because
 * Kafka was down for longer than the producer retries is acceptable; the critical ones have a manual
 * resend (the link of an appointment, the email verification). Therefore:
 * - call it AFTER the transaction that caused it commits (never inside it: a rollback would leave a
 *   notification about something that did not happen);
 * - `emit` never throws: a failed notification must not undo a booking. Use `emitOrThrow` in tests.
 */
@Injectable()
export class NotificationClient {
  private readonly logger = new Logger(NotificationClient.name);

  constructor(
    private readonly publisher: EventPublisher,
    private readonly config: SharedConfigService,
  ) {}

  /** Publishes the command. Returns the message sent, or null when it was invalid or Kafka failed (logged). */
  async emit(channel: NotificationChannel, input: NotificationInput): Promise<NotificationMessage | null> {
    try {
      return await this.emitOrThrow(channel, input);
    } catch (error: any) {
      this.logger.error(`Notification ${channel} was not emitted: ${error?.message}`);
      return null;
    }
  }

  /** Like `emit`, but a problem is an exception (an invalid message, Kafka down) */
  async emitOrThrow(channel: NotificationChannel, input: NotificationInput): Promise<NotificationMessage> {
    const message = buildNotificationMessage(channel, input, this.config.serviceName);

    const problems = validateNotificationMessage(message);
    if (problems.length > 0) {
      throw new Error(`invalid notification: ${problems.join('; ')}`);
    }

    const event: DomainEvent = {
      eventType: NOTIFICATION_TOPICS[channel],
      eventId: message.id,
      aggregateId: message.id,
      aggregateType: 'Notification',
      tenantId: message.recipient.tenantId,
      userId: message.recipient.userId,
      timestamp: new Date(),
      version: 1,
      data: message as unknown as Record<string, unknown>,
      metadata: { source: message.source, correlationId: message.correlationId },
    };
    // The same recipient always lands in the same partition: its notifications are delivered in order
    await this.publisher.publishEventOrThrow(event, message.recipient.userId ?? message.recipient.email ?? message.id);
    return message;
  }
}
