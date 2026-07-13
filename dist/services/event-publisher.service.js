"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var EventPublisher_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.EventPublisher = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const client_sqs_1 = require("@aws-sdk/client-sqs");
const client_sns_1 = require("@aws-sdk/client-sns");
const events_1 = require("../types/events");
const crypto_1 = require("crypto");
let EventPublisher = EventPublisher_1 = class EventPublisher {
    constructor(customConfig, configService) {
        this.configService = configService;
        this.logger = new common_1.Logger(EventPublisher_1.name);
        this.config = customConfig || this.loadConfigFromEnv();
        this.sqsClient = new client_sqs_1.SQSClient({
            region: this.config.awsRegion || 'us-east-1',
            endpoint: this.config.awsEndpoint,
        });
        this.snsClient = new client_sns_1.SNSClient({
            region: this.config.awsRegion || 'us-east-1',
            endpoint: this.config.awsEndpoint,
        });
    }
    loadConfigFromEnv() {
        const config = {
            sqsEnabled: this.configService?.get('EVENTS_SQS_ENABLED') !== 'false',
            snsEnabled: this.configService?.get('EVENTS_SNS_ENABLED') !== 'false',
            sqsQueueUrl: this.configService?.get('AWS_SQS_NOTIFICATIONS_QUEUE_URL'),
            awsEndpoint: this.configService?.get('AWS_ENDPOINT_URL'),
            awsRegion: this.configService?.get('AWS_REGION'),
            snsTopicArns: {
                APPOINTMENT_EVENTS: this.configService?.get('AWS_SNS_APPOINTMENT_EVENTS_TOPIC_ARN') || '',
                BUSINESS_EVENTS: this.configService?.get('AWS_SNS_BUSINESS_EVENTS_TOPIC_ARN') || '',
                PAYMENT_EVENTS: this.configService?.get('AWS_SNS_PAYMENT_EVENTS_TOPIC_ARN') || '',
                USER_EVENTS: this.configService?.get('AWS_SNS_USER_EVENTS_TOPIC_ARN') || '',
            },
        };
        return config;
    }
    async publishEvent(event) {
        if (!this.config.sqsEnabled || !this.config.sqsQueueUrl) {
            this.logger.warn('SQS is not enabled or queue URL not configured');
            return;
        }
        try {
            const messageBody = {
                ...event,
                eventId: event.eventId || (0, crypto_1.randomUUID)(),
                timestamp: event.timestamp || new Date(),
            };
            const command = new client_sqs_1.SendMessageCommand({
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
            this.logger.log(`Event published to SQS: ${event.eventType} (MessageId: ${response.MessageId})`);
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            const errorStack = error instanceof Error ? error.stack : undefined;
            this.logger.error(`Failed to publish event to SQS: ${errorMessage}`, errorStack);
            throw error;
        }
    }
    async publishEventsBatch(events) {
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
                    eventId: event.eventId || (0, crypto_1.randomUUID)(),
                    timestamp: event.timestamp || new Date(),
                }),
                MessageAttributes: {
                    eventType: {
                        StringValue: event.eventType,
                        DataType: 'String',
                    },
                },
            }));
            const command = new client_sqs_1.SendMessageBatchCommand({
                QueueUrl: this.config.sqsQueueUrl,
                Entries: entries,
            });
            const response = await this.sqsClient.send(command);
            this.logger.log(`Batch events published to SQS: ${response.Successful?.length || 0} messages`);
            if (response.Failed && response.Failed.length > 0) {
                this.logger.error(`Failed to publish ${response.Failed.length} events`, response.Failed);
            }
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            const errorStack = error instanceof Error ? error.stack : undefined;
            this.logger.error(`Failed to publish event batch to SQS: ${errorMessage}`, errorStack);
            throw error;
        }
    }
    async publishToTopic(event) {
        if (!this.config.snsEnabled) {
            this.logger.warn('SNS is not enabled');
            return;
        }
        const topicArn = this.getTopicArnForEvent(event);
        if (!topicArn) {
            this.logger.warn(`No SNS topic configured for event type: ${event.eventType}`);
            return;
        }
        try {
            const command = new client_sns_1.PublishCommand({
                TopicArn: topicArn,
                Subject: `Event: ${event.eventType}`,
                Message: JSON.stringify({
                    ...event,
                    eventId: event.eventId || (0, crypto_1.randomUUID)(),
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
            this.logger.log(`Event published to SNS: ${event.eventType} (MessageId: ${response.MessageId})`);
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            const errorStack = error instanceof Error ? error.stack : undefined;
            this.logger.error(`Failed to publish event to SNS: ${errorMessage}`, errorStack);
            throw error;
        }
    }
    async publishEventAndQueue(event) {
        const publishPromises = [];
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
    getTopicArnForEvent(event) {
        const topicArns = this.config.snsTopicArns || {};
        switch (true) {
            case [
                events_1.DomainEventType.APPOINTMENT_CREATED,
                events_1.DomainEventType.APPOINTMENT_CANCELLED,
                events_1.DomainEventType.APPOINTMENT_CONFIRMED,
            ].includes(event.eventType):
                return topicArns['APPOINTMENT_EVENTS'] || null;
            case [
                events_1.DomainEventType.BUSINESS_REGISTERED,
                events_1.DomainEventType.BUSINESS_REQUEST_APPROVED,
                events_1.DomainEventType.BUSINESS_REQUEST_REJECTED,
            ].includes(event.eventType):
                return topicArns['BUSINESS_EVENTS'] || null;
            case [
                events_1.DomainEventType.PAYMENT_INITIATED,
                events_1.DomainEventType.PAYMENT_SUCCESSFUL,
                events_1.DomainEventType.PAYMENT_FAILED,
            ].includes(event.eventType):
                return topicArns['PAYMENT_EVENTS'] || null;
            case [events_1.DomainEventType.USER_REGISTERED, events_1.DomainEventType.USER_DELETED].includes(event.eventType):
                return topicArns['USER_EVENTS'] || null;
            default:
                return null;
        }
    }
    createEvent(eventType, aggregateId, aggregateType, data, userId, tenantId) {
        return {
            eventType,
            eventId: (0, crypto_1.randomUUID)(),
            aggregateId,
            aggregateType,
            tenantId,
            userId,
            timestamp: new Date(),
            version: 1,
            data,
            metadata: {
                correlationId: (0, crypto_1.randomUUID)(),
                source: process.env.SERVICE_NAME || 'unknown-service',
            },
        };
    }
};
exports.EventPublisher = EventPublisher;
exports.EventPublisher = EventPublisher = EventPublisher_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Optional)()),
    __param(0, (0, common_1.Inject)('EVENT_PUBLISHER_CONFIG')),
    __param(1, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [Object, config_1.ConfigService])
], EventPublisher);
//# sourceMappingURL=event-publisher.service.js.map