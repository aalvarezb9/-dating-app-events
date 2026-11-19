import { randomUUID } from 'crypto';
import { Injectable } from '@nestjs/common';
import { SharedConfigService } from '../config/env.config';
import { AppointmentRequestCreatedData } from '../contracts/appointment-request.contract';
import { QueueSender } from '../messaging/queue-sender';
import { DomainEvent, DomainEventType } from '../types/events';

/**
 * What a service asks of `backend-dating-schedule` through its queues (the arbiter of the agenda owns them). Same pattern as
 * `NotificationClient`: the caller gives the data, the client builds the message, picks the group and sends it; no service
 * writes a queue name.
 */
@Injectable()
export class ScheduleClient {
  constructor(
    private readonly queues: QueueSender,
    private readonly config: SharedConfigService,
  ) {}

  /**
   * Hands a booking request to schedule, which decides it. The request lives only in this message: it throws when it could not
   * be queued, and the caller answers 503 so the person tries again with the same `requestId` (the queue ignores the repeat).
   *
   * Every request of one agenda (business, member and day) goes to the same group, so schedule decides them one after another.
   */
  async requestAppointment(data: AppointmentRequestCreatedData, userId?: string): Promise<void> {
    const event: DomainEvent = {
      eventId: randomUUID(),
      eventType: DomainEventType.APPOINTMENT_REQUEST_CREATED,
      aggregateId: data.requestId,
      aggregateType: 'AppointmentRequest',
      tenantId: data.tenantId,
      userId,
      timestamp: new Date(),
      version: 2,
      data: data as unknown as Record<string, any>,
      metadata: { source: this.config.serviceName },
    };

    await this.queues.sendTo('sch.appointmentRequest', event, {
      group: `${data.tenantId}:${data.teamMemberId ?? 'no-team'}`,
      dedup: data.requestId,
    });
  }
}
