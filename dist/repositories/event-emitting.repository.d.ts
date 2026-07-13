import { Logger } from '@nestjs/common';
import { Repository, SaveOptions, RemoveOptions } from 'typeorm';
import { DomainEvent, DomainEventType } from '../types/events';
import { EventPublisher } from '../services/event-publisher.service';
export interface EventEmittingRepositoryConfig {
    entityName: string;
    publishOnCreate?: boolean;
    publishOnUpdate?: boolean;
    publishOnDelete?: boolean;
    eventTypeOnCreate?: DomainEventType;
    eventTypeOnUpdate?: DomainEventType;
    eventTypeOnDelete?: DomainEventType;
    eventDataExtractor?: (entity: any) => Record<string, any>;
}
export declare abstract class EventEmittingRepository<Entity = any> {
    protected readonly repository: Repository<any>;
    protected readonly eventPublisher: EventPublisher;
    protected readonly config: EventEmittingRepositoryConfig;
    protected readonly logger: Logger;
    protected pendingEvents: DomainEvent[];
    constructor(repository: Repository<any>, eventPublisher: EventPublisher, config: EventEmittingRepositoryConfig);
    save(entity: any, options?: SaveOptions): Promise<any>;
    remove(entity: any, options?: RemoveOptions): Promise<any>;
    protected createEventForEntity(entity: Entity, eventType: DomainEventType, operation: 'create' | 'update' | 'delete'): DomainEvent;
    getPendingEvents(): DomainEvent[];
    clearPendingEvents(): void;
    publishPendingEvents(): Promise<void>;
    protected getEntityIdFieldName(entity: any): string;
    protected generateId(): string;
    find(options?: any): Promise<any[]>;
    findOne(options: any): Promise<any>;
    findBy(where: any): Promise<any[]>;
    findOneBy(where: any): Promise<any>;
    count(options?: any): Promise<number>;
    update(criteria: any, partialEntity: any): Promise<import("typeorm").UpdateResult>;
    delete(criteria: any): Promise<import("typeorm").DeleteResult>;
    createQueryBuilder(alias?: string): import("typeorm").SelectQueryBuilder<any>;
}
//# sourceMappingURL=event-emitting.repository.d.ts.map