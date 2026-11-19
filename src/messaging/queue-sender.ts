import { Injectable, Logger } from '@nestjs/common';
import { GetQueueUrlCommand, SendMessageCommand, SQSClient } from '@aws-sdk/client-sqs';
import { SharedConfigService } from '../config/env.config';
import { QUEUES, QueueRef, QueueSpec } from '../contracts/queues';
import { MAX_MESSAGE_BYTES, createSqsClient } from './aws-clients';
import { queueName, splitQueueRef } from './names';

export interface SendOptions {
  /** FIFO queues: messages of one group are handled one after another, in order */
  group?: string;
  /** FIFO queues: the same id inside 5 minutes is accepted once */
  dedup?: string;
  /** Hold the message back this long (SQS allows up to 900 seconds); standard queues only */
  delaySeconds?: number;
}

/**
 * Sends one message to a queue, by the logical name of the registry (`QUEUES`). It is the only code that talks to SQS for sending.
 *
 * - `send` is for a queue OF THIS SERVICE (the reservation timer of schedule): it refuses a queue that belongs to another one.
 * - `sendTo` is for the client of the service that owns the queue (`ScheduleClient`, `NotificationClient`): a service does not
 *   call it, it calls that client, which knows the shape of the message and its group.
 */
@Injectable()
export class QueueSender {
  private readonly logger = new Logger(QueueSender.name);
  private sqsClient?: SQSClient;
  private readonly urls = new Map<string, Promise<string>>();

  constructor(private readonly config: SharedConfigService) {}

  async send(queue: QueueRef, body: unknown, options: SendOptions = {}): Promise<void> {
    const owner = QUEUES[queue].owner;
    if (owner !== this.config.serviceNamespace) {
      throw new Error(
        `The queue ${queue} belongs to "${owner}", not to this service ("${this.config.serviceNamespace}"): use the client of that service`,
      );
    }
    await this.sendTo(queue, body, options);
  }

  async sendTo(queue: QueueRef, body: unknown, options: SendOptions = {}): Promise<void> {
    const spec: QueueSpec = QUEUES[queue];
    const { group, dedup, delaySeconds } = options;

    if (spec.fifo && (!group || !dedup)) {
      throw new Error(`The queue ${queue} is FIFO: a message needs a group and a deduplication id`);
    }
    if (!spec.fifo && (group || dedup)) {
      throw new Error(`The queue ${queue} is not FIFO: it takes no group or deduplication id`);
    }
    if (delaySeconds !== undefined) {
      const max = spec.maxDelaySeconds ?? 0;
      if (spec.fifo || delaySeconds < 0 || delaySeconds > max) {
        throw new Error(`The queue ${queue} does not accept a delay of ${delaySeconds} seconds (maximum ${max})`);
      }
    }

    const message = JSON.stringify(body);
    if (Buffer.byteLength(message) > MAX_MESSAGE_BYTES) {
      throw new Error(`The message for ${queue} is too large (${Buffer.byteLength(message)} bytes)`);
    }

    const eventType = (body as { eventType?: unknown } | null)?.eventType;
    await this.client().send(
      new SendMessageCommand({
        QueueUrl: await this.urlOf(queue),
        MessageBody: message,
        ...(eventType ? { MessageAttributes: { eventType: { DataType: 'String', StringValue: String(eventType) } } } : {}),
        ...(spec.fifo ? { MessageGroupId: group, MessageDeduplicationId: dedup } : {}),
        ...(delaySeconds ? { DelaySeconds: delaySeconds } : {}),
      }),
    );
    this.logger.debug(`Sent to ${queue}${eventType ? ` (${eventType})` : ''}`);
  }

  private client(): SQSClient {
    this.sqsClient ??= createSqsClient(this.config.messaging);
    return this.sqsClient;
  }

  /** The URL of a queue is asked once per process and kept: the name is deterministic */
  private urlOf(queue: QueueRef): Promise<string> {
    let url = this.urls.get(queue);
    if (!url) {
      const { namespace, queue: name } = splitQueueRef(queue);
      const queueUrl = this.client()
        .send(new GetQueueUrlCommand({ QueueName: queueName(namespace, name, this.config.messaging.stage, !!(QUEUES[queue] as QueueSpec).fifo) }))
        .then((result) => {
          if (!result.QueueUrl) throw new Error(`Queue ${queue} has no URL`);
          return result.QueueUrl;
        });
      // A failed lookup is not remembered: the queue may be created a moment later
      queueUrl.catch(() => this.urls.delete(queue));
      this.urls.set(queue, queueUrl);
      url = queueUrl;
    }
    return url;
  }
}
