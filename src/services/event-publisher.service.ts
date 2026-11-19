import { Injectable, OnModuleDestroy, Logger } from '@nestjs/common';
import { PublishCommand, SNSClient } from '@aws-sdk/client-sns';
import { randomUUID } from 'crypto';
import { DomainEvent, DomainEventType } from '../types/events';
import { SharedConfigService } from '../config/env.config';
import { routeOf } from '../contracts/event-routes';
import { MAX_MESSAGE_BYTES, createSnsClient } from '../messaging/aws-clients';
import { topicArn } from '../messaging/names';

/**
 * Event Publisher: announces a fact on the SNS topic of the service (`<namespace>-events-<stage>`).
 *
 * Whoever cares subscribes a queue to that topic (the filter is the `eventType` attribute); the publisher does not know them.
 * The two methods are the same publication with different guarantees:
 * - `publishEvent` never throws: a failure is logged and the caller goes on. It is what `BaseRepository` uses for the events of
 *   its `events` configuration, and what a fact nobody depends on should use.
 * - `publishEventOrThrow` throws when the event could not be published, for the facts that must not be lost (call it AFTER the
 *   transaction that caused them commits, and answer 503 or retry when it throws).
 *
 * An order for one queue (`APPOINTMENT_REQUEST_CREATED`, the notification commands) is not published here: it belongs to the
 * client of the service that owns that queue (`ScheduleQueueClient`, `NotificationClient`).
 *
 * @example
 * ```typescript
 * await this.events.publishEventOrThrow(
 *   this.events.createEvent(DomainEventType.EMAIL_VERIFIED, user.id, 'User', data, user.id, user.tenantId),
 * );
 * ```
 */
@Injectable()
export class EventPublisher implements OnModuleDestroy {
  private readonly logger = new Logger(EventPublisher.name);
  private snsClient?: SNSClient;

  constructor(private config: SharedConfigService) {}

  /** Publishes the event; never throws (a failure is logged) */
  async publishEvent(event: DomainEvent): Promise<void> {
    try {
      await this.publishEventOrThrow(event);
    } catch (error: any) {
      this.logger.error(`Event ${event?.eventType} was not published: ${error?.message}`, error?.stack);
    }
  }

  /** Publishes the event and throws if it could not be published */
  async publishEventOrThrow(event: DomainEvent): Promise<void> {
    const route = routeOf(event.eventType);
    if (route.kind === 'client') {
      throw new Error(`${event.eventType} is an order for a queue: send it with ${route.client}, not with the EventPublisher`);
    }

    const complete: DomainEvent = {
      ...event,
      eventId: event.eventId || randomUUID(),
      timestamp: event.timestamp || new Date(),
    };
    const message = JSON.stringify(complete);
    if (Buffer.byteLength(message) > MAX_MESSAGE_BYTES) {
      throw new Error(`Event ${event.eventType} is too large (${Buffer.byteLength(message)} bytes)`);
    }

    const messaging = this.config.messaging;
    await this.client().send(
      new PublishCommand({
        TopicArn: topicArn(messaging, messaging.namespace),
        Message: message,
        MessageAttributes: { eventType: { DataType: 'String', StringValue: event.eventType } },
      }),
    );
    this.logger.debug(`Event published: ${event.eventType} (id: ${complete.eventId})`);
  }

  /**
   * Create a domain event object with auto-generated fields
   *
   * @param eventType - Type of the event
   * @param aggregateId - ID of the aggregate
   * @param aggregateType - Type of the aggregate
   * @param data - Event data payload
   * @param userId - Optional user ID
   * @param tenantId - Optional tenant ID
   * @returns Complete domain event
   */
  createEvent(
    eventType: DomainEventType,
    aggregateId: string,
    aggregateType: string,
    data: Record<string, any>,
    userId?: string,
    tenantId?: string,
  ): DomainEvent {
    return {
      eventType,
      eventId: randomUUID(),
      aggregateId,
      aggregateType,
      tenantId,
      userId,
      timestamp: new Date(),
      version: 1,
      data,
      metadata: {
        correlationId: randomUUID(),
        source: this.config.serviceName,
      },
    };
  }

  onModuleDestroy() {
    this.snsClient?.destroy();
  }

  private client(): SNSClient {
    this.snsClient ??= createSnsClient(this.config.messaging);
    return this.snsClient;
  }
}
