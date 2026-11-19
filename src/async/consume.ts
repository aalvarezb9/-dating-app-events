import 'reflect-metadata';
import { INestApplicationContext, Logger, Type } from '@nestjs/common';
import { ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import { NestFactory } from '@nestjs/core';
import { PATTERN_METADATA } from '@nestjs/microservices/constants';
import { RpcParamtype } from '@nestjs/microservices/enums/rpc-paramtype.enum';

/**
 * The entry of a Lambda that reads an SQS queue: `export const processCatalog = consume(AppModule, CatalogProjectionConsumer);`
 *
 * AWS already carries the message from the topic to the queue and from the queue to the function. What is left for this
 * file is the part that the Kafka transport of Nest used to do inside a long-running process:
 *  - start Nest ONCE per instance (the application context, with no HTTP and no transport) and reuse it between invocations;
 *  - read each message of the batch and call the method of the consumer that declared `@EventPattern(<its eventType>)`,
 *    with the same two arguments as before (`@Payload()` the event, `@Ctx()` something with the shape of the Kafka context);
 *  - answer which messages failed, so SQS gives back only those (`ReportBatchItemFailures`).
 *
 * The consumers do not change: what they already did with Kafka is what SQS needs. A handler that RETURNS has consumed the
 * message (a malformed event is ignored with a warning, as before); a handler that THROWS asks for it to be delivered again,
 * until the queue sends it to its dead letter queue.
 */

/** The part of an SQS record this file reads (the shape of the `aws-lambda` type, without depending on it) */
export interface SqsRecordLike {
  messageId: string;
  body: string;
  attributes?: Record<string, string | undefined>;
}

export interface SqsEventLike {
  Records: SqsRecordLike[];
}

export interface LambdaContextLike {
  getRemainingTimeInMillis?: () => number;
}

export interface SqsBatchResponse {
  batchItemFailures: Array<{ itemIdentifier: string }>;
}

/** What `@Ctx()` receives where a consumer used to get a `KafkaContext`: the three things the consumers read from it */
export class QueueMessageContext {
  constructor(
    private readonly record: SqsRecordLike,
    private readonly event: unknown,
    private readonly eventType: string,
  ) {}

  /** `offset` is the id of the SQS message (a log line can find it); `key` is the group of a FIFO queue */
  getMessage() {
    return { offset: this.record.messageId, key: this.record.attributes?.MessageGroupId ?? null, value: this.event, headers: {} };
  }

  getTopic(): string {
    return this.eventType;
  }

  getPartition(): number {
    return 0;
  }
}

type Handler = (payload: unknown, context: QueueMessageContext) => Promise<unknown>;

/** Time left below which the rest of the batch is given back instead of started (the function would be cut mid-message) */
const SAFETY_MARGIN_MS = 5_000;

const logger = new Logger('consume');

/** The methods of a consumer class by the event type they declared with `@EventPattern` */
export function routesOf(consumer: Type<unknown>): Map<string, Array<{ method: string; call: (instance: any, payload: unknown, context: QueueMessageContext) => Promise<unknown> }>> {
  const routes = new Map<string, Array<{ method: string; call: (instance: any, payload: unknown, context: QueueMessageContext) => Promise<unknown> }>>();

  for (const method of Object.getOwnPropertyNames(consumer.prototype)) {
    const fn = (consumer.prototype as any)[method];
    const patterns: unknown[] | undefined = typeof fn === 'function' ? Reflect.getMetadata(PATTERN_METADATA, fn) : undefined;
    if (!patterns) continue;

    // Where `@Payload()` and `@Ctx()` sit in the signature (Nest stores them as "<paramtype>:<index>")
    const declared: Record<string, unknown> = Reflect.getMetadata(ROUTE_ARGS_METADATA, consumer, method) ?? {};
    let payloadAt = 0;
    let contextAt = 1;
    for (const key of Object.keys(declared)) {
      const [type, index] = key.split(':').map(Number);
      if (type === RpcParamtype.PAYLOAD) payloadAt = index;
      if (type === RpcParamtype.CONTEXT) contextAt = index;
    }

    const call = (instance: any, payload: unknown, context: QueueMessageContext) => {
      const args: unknown[] = [];
      args[payloadAt] = payload;
      args[contextAt] = context;
      return instance[method](...args);
    };

    for (const pattern of patterns) {
      if (typeof pattern !== 'string') continue;
      routes.set(pattern, [...(routes.get(pattern) ?? []), { method, call }]);
    }
  }
  return routes;
}

/** The event inside a record: the body itself (raw delivery, or a message sent straight to the queue) or the envelope of SNS */
function eventOf(record: SqsRecordLike): any {
  const body = JSON.parse(record.body);
  if (body && body.Type === 'Notification' && typeof body.Message === 'string') {
    return JSON.parse(body.Message);
  }
  return body;
}

export function consume(appModule: Type<unknown>, consumer: Type<unknown>) {
  const routes = routesOf(consumer);
  if (routes.size === 0) {
    throw new Error(`${consumer.name} has no @EventPattern: there is nothing for consume() to call`);
  }

  let app: Promise<INestApplicationContext> | undefined;

  const context = (): Promise<INestApplicationContext> => {
    app ??= NestFactory.createApplicationContext(appModule, { logger: ['error', 'warn'] }).catch((error) => {
      app = undefined; // a failed start is not kept: the next invocation tries again
      throw error;
    });
    return app;
  };

  return async (sqsEvent: SqsEventLike, lambdaContext?: LambdaContextLike): Promise<SqsBatchResponse> => {
    const instance = (await context()).get(consumer, { strict: false });
    const failures: string[] = [];
    // A FIFO group is decided in order: once one message of it fails, the rest of that group goes back too
    const blockedGroups = new Set<string>();

    for (const record of sqsEvent.Records) {
      const group = record.attributes?.MessageGroupId;
      const remaining = lambdaContext?.getRemainingTimeInMillis?.();

      if ((group && blockedGroups.has(group)) || (remaining !== undefined && remaining < SAFETY_MARGIN_MS)) {
        failures.push(record.messageId);
        if (group) blockedGroups.add(group);
        continue;
      }

      let event: any;
      try {
        event = eventOf(record);
      } catch {
        // A body that is not JSON cannot become one by being delivered again
        logger.error(`Message ${record.messageId} is not JSON: dropped`);
        continue;
      }

      const handlers = routes.get(event?.eventType);
      if (!handlers) {
        // Nobody here listens to it: it is a wiring mistake, so it must end in the dead letter queue where it is seen
        logger.error(`Message ${record.messageId}: ${consumer.name} has no handler for "${event?.eventType}"`);
        failures.push(record.messageId);
        if (group) blockedGroups.add(group);
        continue;
      }

      try {
        const messageContext = new QueueMessageContext(record, event, event.eventType);
        for (const handler of handlers) {
          await handler.call(instance, event, messageContext);
        }
      } catch (error: any) {
        logger.error(`Message ${record.messageId} (${event.eventType}) failed: ${error?.message}`, error?.stack);
        failures.push(record.messageId);
        if (group) blockedGroups.add(group);
      }
    }

    return { batchItemFailures: failures.map((itemIdentifier) => ({ itemIdentifier })) };
  };
}
