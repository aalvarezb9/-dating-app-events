/**
 * The only place that builds the name of a topic or a queue. The publisher, the senders, the consumer manifest, the
 * Serverless helper and the local runner all call these functions, so a name is never written twice.
 *
 * Plain functions with no imports: `serverless/queue-resources.js` loads this file from the compiled library.
 *
 *   queue            `<ns>-<queue>-<stage>`         `sch-paymentProof-dev`
 *   FIFO queue       `<ns>-<queue>-<stage>.fifo`    `sch-appointmentRequest-dev.fifo`
 *   dead letter      `<ns>-<queue>Dlq-<stage>`      `sch-paymentProofDlq-dev`
 *   topic            `<ns>-events-<stage>`          `bo-events-dev`
 */

export interface Naming {
  region: string;
  accountId: string;
  stage: string;
}

export const FIFO_SUFFIX = '.fifo';

export function queueName(namespace: string, queue: string, stage: string, fifo = false): string {
  return `${namespace}-${queue}-${stage}${fifo ? FIFO_SUFFIX : ''}`;
}

export function dlqName(namespace: string, queue: string, stage: string, fifo = false): string {
  return queueName(namespace, `${queue}Dlq`, stage, fifo);
}

export function topicName(namespace: string, stage: string): string {
  return `${namespace}-events-${stage}`;
}

export function topicArn(naming: Naming, namespace: string): string {
  return `arn:aws:sns:${naming.region}:${naming.accountId}:${topicName(namespace, naming.stage)}`;
}

export function queueArn(naming: Naming, namespace: string, queue: string, fifo = false): string {
  return `arn:aws:sqs:${naming.region}:${naming.accountId}:${queueName(namespace, queue, naming.stage, fifo)}`;
}

/** A logical queue name of the registry (`sch.appointmentRequest`) split into its namespace and its name */
export function splitQueueRef(ref: string): { namespace: string; queue: string } {
  const dot = ref.indexOf('.');
  if (dot <= 0 || dot === ref.length - 1) {
    throw new Error(`Invalid queue reference "${ref}": use "<namespace>.<queue>"`);
  }
  return { namespace: ref.slice(0, dot), queue: ref.slice(dot + 1) };
}
