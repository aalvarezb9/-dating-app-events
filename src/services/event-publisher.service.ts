import { Injectable, Logger, Inject, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  SQSClient,
  SendMessageCommand,
  SendMessageBatchCommand,
} from '@aws-sdk/client-sqs';
import {
  SNSClient,
  PublishCommand,
  PublishBatchCommand,
} from '@aws-sdk/client-sns';
import { DomainEvent, DomainEventType } from '../types/events';
import { randomUUID } from 'crypto';

/**
 * Interface for event publisher configuration
 */
export interface EventPublisherConfig {
  sqsEnabled: boolean;
  snsEnabled: boolean;
  sqsQueueUrl?: string;
  snsTopicArns?: Record<string, string>;
  awsEndpoint?: string;
  awsRegion?: string;
}

/**
 * EventPublisher service for publishing domain events to SQS/SNS
 * Handles event distribution to queues and topics
 */
@Injectable()
export class EventPublisher {
  private readonly logger = new Logger(EventPublisher.name);
  private readonly sqsClient: SQSClient;
  private readonly snsClient: SNSClient;
  private readonly config: EventPublisherConfig;

  constructor(
    @Optional() @Inject('EVENT_PUBLISHER_CONFIG')
    customConfig?: EventPublisherConfig,
    @Optional() private readonly configService?: ConfigService,
  ) {
    this.config = customConfig || this.loadConfigFromEnv();

    this.sqsClient = new SQSClient({
      region: this.config.awsRegion || 'us-east-1',
      endpoint: this.config.awsEndpoint,
    });

    this.snsClient = new SNSClient({
      region: this.config.awsRegion || 'us-east-1',
      endpoint: this.config.awsEndpoint,
    });
  }

  /**
   * Load configuration from environment variables (NestJS ConfigService)
   */
  private loadConfigFromEnv(): EventPublisherConfig {
    const config: EventPublisherConfig = {
      sqsEnabled:
        this.configService?.get<string>('EVENTS_SQS_ENABLED') !== 'false',
      snsEnabled:
        this.configService?.get<string>('EVENTS_SNS_ENABLED') !== 'false',
      sqsQueueUrl: this.configService?.get<string>(
        'AWS_SQS_NOTIFICATIONS_QUEUE_URL',
      ),
      awsEndpoint: this.configService?.get<string>('AWS_ENDPOINT_URL'),
      awsRegion: this.configService?.get<string>('AWS_REGION'),
      snsTopicArns: {
        APPOINTMENT_EVENTS: this.configService?.get<string>(
          'AWS_SNS_APPOINTMENT_EVENTS_TOPIC_ARN',
        ) || '',
        BUSINESS_EVENTS: this.configService?.get<string>(
          'AWS_SNS_BUSINESS_EVENTS_TOPIC_ARN',
        ) || '',
        PAYMENT_EVENTS: this.configService?.get<string>(
          'AWS_SNS_PAYMENT_EVENTS_TOPIC_ARN',
        ) || '',
        USER_EVENTS: this.configService?.get<string>(
          'AWS_SNS_USER_EVENTS_TOPIC_ARN',
        ) || '',
      },
    };

    return config;
  }

  /**
   * Publish a single domain event to SQS
   * @param event - Domain event to publish
   */
  async publishEvent(event: DomainEvent): Promise<void> {
    if (!this.config.sqsEnabled || !this.config.sqsQueueUrl) {
      this.logger.warn('SQS is not enabled or queue URL not configured');
      return;
    }

    try {
      const messageBody = {
        ...event,
        eventId: event.eventId || randomUUID(),
        timestamp: event.timestamp || new Date(),
      };

      const command = new SendMessageCommand({
        QueueUrl: this.config.sqsQueueUrl,
        MessageBody: JSON.stringify(messageBody),
        MessageAttributes: {
          eventType: {
            StringValue: event.eventType,
            DataType: 'String',
          },
          aggregateType: {
            StringValue: event.aggregateType,
            DataType: 'String',
          },
          ...(event.tenantId && {
            tenantId: {
              StringValue: event.tenantId,
              DataType: 'String',
            },
          }),
        },
      });

      const response = await this.sqsClient.send(command);
      this.logger.log(
        `Event published to SQS: ${event.eventType} (MessageId: ${response.MessageId})`,
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(
        `Failed to publish event to SQS: ${errorMessage}`,
        errorStack,
      );
      throw error;
    }
  }

  /**
   * Publish multiple domain events to SQS in batch
   * @param events - Array of domain events
   */
  async publishEventsBatch(events: DomainEvent[]): Promise<void> {
    if (!this.config.sqsEnabled || !this.config.sqsQueueUrl) {
      this.logger.warn('SQS is not enabled or queue URL not configured');
      return;
    }

    if (events.length === 0) {
      return;
    }

    try {
      const entries = events.map((event, index) => ({
        Id: (index + 1).toString(),
        MessageBody: JSON.stringify({
          ...event,
          eventId: event.eventId || randomUUID(),
          timestamp: event.timestamp || new Date(),
        }),
        MessageAttributes: {
          eventType: {
            StringValue: event.eventType,
            DataType: 'String',
          },
        },
      }));

      const command = new SendMessageBatchCommand({
        QueueUrl: this.config.sqsQueueUrl,
        Entries: entries,
      });

      const response = await this.sqsClient.send(command);
      this.logger.log(
        `Batch events published to SQS: ${response.Successful?.length || 0} messages`,
      );

      if (response.Failed && response.Failed.length > 0) {
        this.logger.error(
          `Failed to publish ${response.Failed.length} events`,
          response.Failed,
        );
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(
        `Failed to publish event batch to SQS: ${errorMessage}`,
        errorStack,
      );
      throw error;
    }
  }

  /**
   * Publish event to SNS topic based on event type
   * @param event - Domain event to publish
   */
  async publishToTopic(event: DomainEvent): Promise<void> {
    if (!this.config.snsEnabled) {
      this.logger.warn('SNS is not enabled');
      return;
    }

    const topicArn = this.getTopicArnForEvent(event);
    if (!topicArn) {
      this.logger.warn(
        `No SNS topic configured for event type: ${event.eventType}`,
      );
      return;
    }

    try {
      const command = new PublishCommand({
        TopicArn: topicArn,
        Subject: `Event: ${event.eventType}`,
        Message: JSON.stringify({
          ...event,
          eventId: event.eventId || randomUUID(),
          timestamp: event.timestamp || new Date(),
        }),
        MessageAttributes: {
          eventType: {
            StringValue: event.eventType,
            DataType: 'String',
          },
          aggregateType: {
            StringValue: event.aggregateType,
            DataType: 'String',
          },
        },
      });

      const response = await this.snsClient.send(command);
      this.logger.log(
        `Event published to SNS: ${event.eventType} (MessageId: ${response.MessageId})`,
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(
        `Failed to publish event to SNS: ${errorMessage}`,
        errorStack,
      );
      throw error;
    }
  }

  /**
   * Publish and queue - send to both SQS and SNS
   * @param event - Domain event to publish
   */
  async publishEventAndQueue(event: DomainEvent): Promise<void> {
    const publishPromises: Promise<void>[] = [];

    if (this.config.sqsEnabled) {
      publishPromises.push(this.publishEvent(event));
    }

    if (this.config.snsEnabled) {
      publishPromises.push(this.publishToTopic(event));
    }

    if (publishPromises.length === 0) {
      this.logger.warn('Neither SQS nor SNS is enabled');
      return;
    }

    await Promise.all(publishPromises);
  }

  /**
   * Get SNS topic ARN based on event type
   */
  private getTopicArnForEvent(event: DomainEvent): string | null {
    const topicArns = this.config.snsTopicArns || {};

    switch (true) {
      case [
        DomainEventType.APPOINTMENT_CREATED,
        DomainEventType.APPOINTMENT_CANCELLED,
        DomainEventType.APPOINTMENT_CONFIRMED,
      ].includes(event.eventType):
        return topicArns['APPOINTMENT_EVENTS'] || null;

      case [
        DomainEventType.BUSINESS_REGISTERED,
        DomainEventType.BUSINESS_REQUEST_APPROVED,
        DomainEventType.BUSINESS_REQUEST_REJECTED,
      ].includes(event.eventType):
        return topicArns['BUSINESS_EVENTS'] || null;

      case [
        DomainEventType.PAYMENT_INITIATED,
        DomainEventType.PAYMENT_SUCCESSFUL,
        DomainEventType.PAYMENT_FAILED,
      ].includes(event.eventType):
        return topicArns['PAYMENT_EVENTS'] || null;

      case [DomainEventType.USER_REGISTERED, DomainEventType.USER_DELETED].includes(
        event.eventType,
      ):
        return topicArns['USER_EVENTS'] || null;

      default:
        return null;
    }
  }

  /**
   * Create a domain event object
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
        source: process.env.SERVICE_NAME || 'unknown-service',
      },
    };
  }
}
