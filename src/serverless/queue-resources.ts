import { dlqName, queueName, topicName } from '../messaging/names';

/**
 * The CloudFormation of the queues of a service, generated from its manifest (`src/async/consumers.manifest.json`), so the
 * queue, its dead letter queue, who may write to it and what it listens to are written once and cannot drift apart.
 *
 * A plain CommonJS module with no Nest and no SDK: a `serverless.yml` loads it through a one-line file of the service
 * (`serverless/queues.js`):
 *
 *   const { queueResources } = require('@dating-app/events/dist/serverless/queue-resources');
 *   module.exports = async ({ resolveVariable }) =>
 *     queueResources(require('../src/async/consumers.manifest.json'), { stage: await resolveVariable('sls:stage'), functionTimeout: 30 });
 *
 * and the `serverless.yml` points its functions at the queues by the names of this file (`<Key>Queue`, see `queueLogicalId`).
 */

/** One consumer of the manifest: a queue that one function of the service reads */
export interface ConsumerSpec {
  /** Namespaces of the services whose topic feeds the queue (it subscribes to each, filtering by `events`) */
  from?: string[];
  /** A queue that nobody subscribes: it is fed by `ScheduleQueueClient`/`QueueSender` (no subscription, no policy) */
  direct?: true;
  /** FIFO queue: one agenda is decided in order. Only a direct queue can be FIFO (a topic here is not FIFO) */
  fifo?: true;
  /** The `eventType`s the queue takes; they are also what the consumer class declares with `@EventPattern` */
  events: string[];
}

export type ConsumersManifest = { namespace: string; consumers: Record<string, ConsumerSpec> };

export interface QueueResourcesOptions {
  stage: string;
  /** Timeout of the function that reads the queue: the queue holds a message back longer than the function can take */
  functionTimeout: number;
  /** Receptions before a message goes to the dead letter queue */
  maxReceiveCount?: number;
}

const KEY = /^[a-z][A-Za-z0-9]*$/;

const pascal = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

/** The logical id of a resource of a consumer: what the `serverless.yml` uses in `!GetAtt NotificationEmailQueue.Arn` */
export const queueLogicalId = (key: string): string => `${pascal(key)}Queue`;

function validate(manifest: ConsumersManifest): void {
  if (!manifest.namespace) throw new Error('The manifest needs the "namespace" of the service');
  for (const [key, spec] of Object.entries(manifest.consumers)) {
    if (!KEY.test(key)) throw new Error(`Consumer "${key}": use camelCase (it becomes the name of the queue)`);
    if (!spec.events?.length) throw new Error(`Consumer "${key}": it needs at least one event`);
    if (spec.direct && spec.from?.length) throw new Error(`Consumer "${key}": it is either "direct" or fed "from" topics, not both`);
    if (!spec.direct && !spec.from?.length) throw new Error(`Consumer "${key}": say "from" which services it listens to, or mark it "direct"`);
    if (spec.fifo && !spec.direct) throw new Error(`Consumer "${key}": a FIFO queue cannot subscribe to a standard topic: it must be "direct"`);
  }
}

export function queueResources(manifest: ConsumersManifest, options: QueueResourcesOptions): { Resources: Record<string, unknown> } {
  validate(manifest);
  const { stage, functionTimeout, maxReceiveCount = 5 } = options;
  const resources: Record<string, unknown> = {};

  for (const [key, spec] of Object.entries(manifest.consumers)) {
    const id = pascal(key);
    const fifo = !!spec.fifo;

    resources[`${id}Dlq`] = {
      Type: 'AWS::SQS::Queue',
      Properties: {
        QueueName: dlqName(manifest.namespace, key, stage, fifo),
        MessageRetentionPeriod: 1_209_600, // 14 days: time to look at what failed
        ...(fifo ? { FifoQueue: true } : {}),
      },
    };

    resources[queueLogicalId(key)] = {
      Type: 'AWS::SQS::Queue',
      Properties: {
        QueueName: queueName(manifest.namespace, key, stage, fifo),
        // A message that is being handled stays hidden longer than the function can take (AWS asks for six times the timeout)
        VisibilityTimeout: functionTimeout * 6,
        RedrivePolicy: { deadLetterTargetArn: { 'Fn::GetAtt': [`${id}Dlq`, 'Arn'] }, maxReceiveCount },
        ...(fifo ? { FifoQueue: true } : {}),
      },
    };

    if (spec.direct) continue;

    // Only the topics of the services it listens to may write to it
    const topics = (spec.from ?? []).map((from) => ({ 'Fn::Sub': `arn:aws:sns:\${AWS::Region}:\${AWS::AccountId}:${topicName(from, stage)}` }));
    resources[`${id}QueuePolicy`] = {
      Type: 'AWS::SQS::QueuePolicy',
      Properties: {
        Queues: [{ Ref: queueLogicalId(key) }],
        PolicyDocument: {
          Version: '2012-10-17',
          Statement: topics.map((topic) => ({
            Effect: 'Allow',
            Principal: { Service: 'sns.amazonaws.com' },
            Action: 'sqs:SendMessage',
            Resource: { 'Fn::GetAtt': [queueLogicalId(key), 'Arn'] },
            Condition: { ArnEquals: { 'aws:SourceArn': topic } },
          })),
        },
      },
    };

    (spec.from ?? []).forEach((from, index) => {
      resources[`${id}From${pascal(from)}Subscription`] = {
        Type: 'AWS::SNS::Subscription',
        DependsOn: `${id}QueuePolicy`,
        Properties: {
          TopicArn: topics[index],
          Protocol: 'sqs',
          Endpoint: { 'Fn::GetAtt': [queueLogicalId(key), 'Arn'] },
          RawMessageDelivery: true,
          FilterPolicy: { eventType: spec.events },
        },
      };
    });
  }

  return { Resources: resources };
}
