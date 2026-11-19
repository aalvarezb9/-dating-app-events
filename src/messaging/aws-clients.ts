import { SNSClient } from '@aws-sdk/client-sns';
import { SQSClient } from '@aws-sdk/client-sqs';
import { MessagingConfig } from '../config/env.config';

/**
 * How to reach AWS, in the shape the SDK clients take. In AWS the SDK finds its endpoints and credentials by itself; against
 * the emulator `AWS_ENDPOINT_URL` points at it (and the host prefix of an operation is not added). Every SNS and SQS client of
 * the platform is built from here.
 */
export function awsClientConfig(messaging: Pick<MessagingConfig, 'region' | 'endpoint'>) {
  return {
    region: messaging.region,
    ...(messaging.endpoint ? { endpoint: messaging.endpoint, disableHostPrefix: true } : {}),
  };
}

export function createSnsClient(messaging: MessagingConfig): SNSClient {
  return new SNSClient(awsClientConfig(messaging));
}

export function createSqsClient(messaging: MessagingConfig): SQSClient {
  return new SQSClient(awsClientConfig(messaging));
}

/** SNS and SQS accept up to 256 KB per message, the attributes included: a margin is left for them */
export const MAX_MESSAGE_BYTES = 250_000;
