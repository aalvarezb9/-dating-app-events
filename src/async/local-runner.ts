import { INestApplicationContext, Logger, Type } from '@nestjs/common';
import {
  ChangeMessageVisibilityCommand,
  DeleteMessageBatchCommand,
  GetQueueUrlCommand,
  Message,
  ReceiveMessageCommand,
  SQSClient,
} from '@aws-sdk/client-sqs';
import { SharedConfigService } from '../config/env.config';
import { createSqsClient } from '../messaging/aws-clients';
import { queueName } from '../messaging/names';
import type { ConsumersManifest } from '../serverless/queue-resources';
import { SqsEventLike, consumeFrom } from './consume';

export interface LocalRunnerOptions {
  /** `src/async/consumers.manifest.json` of the service */
  manifest: ConsumersManifest;
  /** The consumer class of every key of the manifest */
  consumers: Record<string, Type<unknown>>;
}

/** Seconds a failed message stays hidden before the queue gives it again: short, so a retry is seen while developing */
const RETRY_AFTER_SECONDS = 2;
/** Seconds one `ReceiveMessage` waits for a message (long polling) */
const WAIT_SECONDS = 5;
const PAUSE_ON_ERROR_MS = 2_000;

/**
 * What Lambda does in AWS and the emulator cannot do: read the SQS queues of the service and hand each batch to the consumers.
 *
 * It runs INSIDE the container of the service in local development (`LOCAL_RUNNER=true`), over the same application, so a
 * consumer is called exactly as `consume()` calls it in a Lambda: the same function, the same `batchItemFailures`. The emulator can
 * create the queues, the subscriptions and the dead letter queues, but its own Lambda cannot run the services (it has no net or tls),
 * and `aws-deploy` switches its event source mappings off so nobody takes the messages before this does.
 *
 * - One loop per queue of the manifest, one batch at a time (a FIFO queue hands one group's messages in order).
 * - What succeeded is deleted; what failed becomes visible again after a few seconds, and the queue sends it to the dead letter
 *   queue after its `maxReceiveCount`, as in AWS.
 * - Timers (`@Cron`) and the startup tasks are NOT here: in the container they keep running by themselves.
 *
 * @returns `stop()`, which ends the loops (the one that is waiting for a message finishes its wait first)
 */
export function startLocalRunner(app: INestApplicationContext, options: LocalRunnerOptions): { stop: () => Promise<void> } {
  const logger = new Logger('LocalRunner');
  const config = app.get(SharedConfigService);
  const sqs = createSqsClient(config.messaging);
  const { namespace, consumers } = options.manifest;
  let running = true;

  const loops = Object.entries(consumers).map(([key, spec]) => {
    const consumer = options.consumers[key];
    if (!consumer) {
      throw new Error(`The local runner has no consumer class for "${key}" of the manifest`);
    }
    const name = queueName(namespace, key, config.messaging.stage, spec.fifo === true);
    return loop(name, consumeFrom(app, consumer));
  });

  async function loop(name: string, handler: ReturnType<typeof consumeFrom>): Promise<void> {
    let queueUrl: string | undefined;
    while (running) {
      try {
        queueUrl ??= (await sqs.send(new GetQueueUrlCommand({ QueueName: name }))).QueueUrl;
        const { Messages = [] } = await sqs.send(
          new ReceiveMessageCommand({
            QueueUrl: queueUrl,
            MaxNumberOfMessages: 10,
            WaitTimeSeconds: WAIT_SECONDS,
            AttributeNames: ['All'],
          }),
        );
        if (Messages.length > 0) {
          await deliver(sqs, queueUrl!, name, Messages, handler, logger);
        }
      } catch (error: any) {
        // The queue may not exist yet (the deploy of the stack is still running) or the emulator may be restarting
        queueUrl = undefined;
        logger.warn(`${name}: ${error?.message ?? error}`);
        await new Promise((resolve) => setTimeout(resolve, PAUSE_ON_ERROR_MS));
      }
    }
  }

  logger.log(`Reading ${Object.keys(consumers).length} queue(s) of ${namespace}: ${Object.keys(consumers).join(', ')}`);
  return { stop: async () => { running = false; await Promise.allSettled(loops); } };
}

async function deliver(
  sqs: SQSClient,
  queueUrl: string,
  name: string,
  messages: Message[],
  handler: ReturnType<typeof consumeFrom>,
  logger: Logger,
): Promise<void> {
  const event: SqsEventLike = {
    Records: messages.map((message) => ({
      messageId: message.MessageId!,
      body: message.Body ?? '',
      attributes: { MessageGroupId: message.Attributes?.MessageGroupId },
    })),
  };

  const { batchItemFailures } = await handler(event, { getRemainingTimeInMillis: () => 60_000 });
  const failed = new Set(batchItemFailures.map((failure) => failure.itemIdentifier));
  const done = messages.filter((message) => !failed.has(message.MessageId!));

  if (done.length > 0) {
    await sqs.send(
      new DeleteMessageBatchCommand({
        QueueUrl: queueUrl,
        Entries: done.map((message, index) => ({ Id: String(index), ReceiptHandle: message.ReceiptHandle! })),
      }),
    );
  }
  for (const message of messages.filter((candidate) => failed.has(candidate.MessageId!))) {
    await sqs
      .send(new ChangeMessageVisibilityCommand({ QueueUrl: queueUrl, ReceiptHandle: message.ReceiptHandle!, VisibilityTimeout: RETRY_AFTER_SECONDS }))
      .catch(() => undefined);
  }
  if (failed.size > 0) {
    logger.warn(`${name}: ${failed.size} of ${messages.length} message(s) failed and will be delivered again`);
  }
}
