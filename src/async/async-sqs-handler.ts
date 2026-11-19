import { Logger } from '@nestjs/common';
import { DomainEvent } from '../types/events';

/**
 * The parts of an SQS event that Lambda hands to a function. Declared here (not imported from `aws-lambda`) so the
 * library does not depend on the Lambda typings; the real `SQSEvent` is assignable to it.
 */
export interface SqsRecordLike {
  messageId: string;
  body: string;
  /** SQS system attributes: `MessageGroupId` (FIFO), `ApproximateReceiveCount`… */
  attributes?: Record<string, string | undefined>;
  eventSource?: string;
}

export interface SqsEventLike {
  Records: SqsRecordLike[];
}

/** What the function returns when the trigger has `ReportBatchItemFailures`: only these messages go back to the queue */
export interface SqsBatchResponse {
  batchItemFailures: { itemIdentifier: string }[];
}

/** One message of the batch: its event, or why it could not be read */
export interface AsyncSqsMessage<T extends DomainEvent> {
  messageId: string;
  /** FIFO queues only */
  groupId?: string;
  receiveCount: number;
  event?: T;
  /** Set when the body is not a valid event: the message is reported as failed (it ends in the DLQ, never lost) */
  invalid?: string;
}

export interface AsyncSqsHandlerOptions {
  /** Event types this queue is meant to receive; any other one is reported as failed (a wrong filter policy must be seen) */
  expectedEventTypes?: readonly string[];
}

export interface AsyncSqsProcessOptions {
  /** `context.getRemainingTimeInMillis` of the Lambda: when it falls under `minRemainingMs` the rest of the batch is returned to the queue */
  remainingTimeMs?: () => number;
  minRemainingMs?: number;
}

/** The trigger is not an SQS one (a wrong `events:` entry in the serverless.yml): the whole invocation fails */
export class InvalidAsyncTriggerError extends Error {}

const SQS_SOURCE = 'aws:sqs';

/**
 * Adapter between an SQS trigger of a Lambda and the service logic. It replaces `@EventPattern` consumers:
 *
 * ```ts
 * // src/async/queues.ts  (serverless.yml: handler: src/async/queues.processPaymentProof)
 * export const processPaymentProof = async (payload: SqsEventLike): Promise<SqsBatchResponse> => {
 *   const queue = new AsyncSqsHandler<PaymentProofUploadedEvent>(payload, { expectedEventTypes: [DomainEventType.PAYMENT_PROOF_UPLOADED] });
 *   const payments = await resolve(AppointmentPaymentsService);
 *   return queue.process((event) => payments.handlePaymentProofUploaded(event));
 * };
 * ```
 *
 * It checks that the payload is an SQS event, reads each body (an event published to SNS with raw delivery, or the SNS
 * envelope if raw delivery is off) and runs the handler once per message, in the order received.
 *
 * Failures: a handler that throws puts ONLY its message back in the queue (it needs `functionResponseType:
 * ReportBatchItemFailures` in the trigger). In a FIFO queue the rest of that message group in the batch is returned too,
 * so the order of a group is never broken. Handlers must be idempotent (by `eventId`): delivery is at-least-once.
 *
 * It never logs the body: events may carry secrets (see the sensitive events of the platform).
 */
export class AsyncSqsHandler<T extends DomainEvent = DomainEvent> {
  private readonly logger = new Logger(AsyncSqsHandler.name);
  readonly messages: AsyncSqsMessage<T>[];

  constructor(payload: unknown, private readonly options: AsyncSqsHandlerOptions = {}) {
    const records = this.records(payload);
    this.messages = records.map((record) => this.read(record));
  }

  /** The events that were read correctly, in the order received */
  get events(): T[] {
    return this.messages.flatMap((message) => (message.event ? [message.event] : []));
  }

  async process(
    handler: (event: T, message: AsyncSqsMessage<T>) => Promise<void>,
    options: AsyncSqsProcessOptions = {},
  ): Promise<SqsBatchResponse> {
    const failed: string[] = [];
    const blockedGroups = new Set<string>();

    for (const message of this.messages) {
      const { messageId, groupId } = message;

      if (groupId && blockedGroups.has(groupId)) {
        failed.push(messageId); // an earlier message of its group failed: keep the order
        continue;
      }

      if (this.isRunningOutOfTime(options)) {
        this.logger.warn(`Out of time: message ${messageId} goes back to the queue`);
        failed.push(messageId);
        if (groupId) blockedGroups.add(groupId);
        continue;
      }

      if (!message.event) {
        this.logger.error(`Message ${messageId} is not a valid event: ${message.invalid}`);
        failed.push(messageId);
        if (groupId) blockedGroups.add(groupId);
        continue;
      }

      try {
        await handler(message.event, message);
      } catch (error: any) {
        this.logger.error(
          `Failed to process ${message.event.eventType} (event ${message.event.eventId}, message ${messageId}, attempt ${message.receiveCount}): ${error?.message}`,
          error?.stack,
        );
        failed.push(messageId);
        if (groupId) blockedGroups.add(groupId);
      }
    }

    return { batchItemFailures: failed.map((itemIdentifier) => ({ itemIdentifier })) };
  }

  private isRunningOutOfTime(options: AsyncSqsProcessOptions): boolean {
    return !!options.remainingTimeMs && options.remainingTimeMs() < (options.minRemainingMs ?? 0);
  }

  private records(payload: unknown): SqsRecordLike[] {
    const records = (payload as SqsEventLike | undefined)?.Records;
    if (!Array.isArray(records) || records.length === 0) {
      throw new InvalidAsyncTriggerError('Not an SQS event: "Records" is missing or empty');
    }
    for (const record of records) {
      if (typeof record?.messageId !== 'string' || typeof record?.body !== 'string') {
        throw new InvalidAsyncTriggerError('Not an SQS event: a record has no messageId or body');
      }
      if (record.eventSource !== undefined && record.eventSource !== SQS_SOURCE) {
        throw new InvalidAsyncTriggerError(`Not an SQS event: eventSource is "${record.eventSource}"`);
      }
    }
    return records;
  }

  private read(record: SqsRecordLike): AsyncSqsMessage<T> {
    const base = {
      messageId: record.messageId,
      groupId: record.attributes?.MessageGroupId,
      receiveCount: Number(record.attributes?.ApproximateReceiveCount ?? 1),
    };

    let parsed: any;
    try {
      parsed = JSON.parse(record.body);
      // Raw delivery off: SNS wraps the event in an envelope whose `Message` is the event as text
      if (parsed?.Type === 'Notification' && typeof parsed.Message === 'string') {
        parsed = JSON.parse(parsed.Message);
      }
    } catch {
      return { ...base, invalid: 'the body is not JSON' };
    }

    if (typeof parsed?.eventId !== 'string' || typeof parsed?.eventType !== 'string' || typeof parsed?.data !== 'object' || parsed.data === null) {
      return { ...base, invalid: 'eventId, eventType and data are required' };
    }
    const expected = this.options.expectedEventTypes;
    if (expected && !expected.includes(parsed.eventType)) {
      return { ...base, invalid: `unexpected event type ${parsed.eventType}` };
    }

    return { ...base, event: { ...parsed, timestamp: new Date(parsed.timestamp) } as T };
  }
}
