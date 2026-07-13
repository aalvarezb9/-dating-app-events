import { ConfigService } from '@nestjs/config';
import { DomainEvent, DomainEventType } from '../types/events';
export interface EventPublisherConfig {
    sqsEnabled: boolean;
    snsEnabled: boolean;
    sqsQueueUrl?: string;
    snsTopicArns?: Record<string, string>;
    awsEndpoint?: string;
    awsRegion?: string;
}
export declare class EventPublisher {
    private readonly configService?;
    private readonly logger;
    private readonly sqsClient;
    private readonly snsClient;
    private readonly config;
    constructor(customConfig?: EventPublisherConfig, configService?: ConfigService | undefined);
    private loadConfigFromEnv;
    publishEvent(event: DomainEvent): Promise<void>;
    publishEventsBatch(events: DomainEvent[]): Promise<void>;
    publishToTopic(event: DomainEvent): Promise<void>;
    publishEventAndQueue(event: DomainEvent): Promise<void>;
    private getTopicArnForEvent;
    createEvent(eventType: DomainEventType, aggregateId: string, aggregateType: string, data: Record<string, any>, userId?: string, tenantId?: string): DomainEvent;
}
//# sourceMappingURL=event-publisher.service.d.ts.map