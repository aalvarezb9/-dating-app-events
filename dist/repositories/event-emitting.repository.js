"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.EventEmittingRepository = void 0;
const common_1 = require("@nestjs/common");
class EventEmittingRepository {
    constructor(repository, eventPublisher, config) {
        this.repository = repository;
        this.eventPublisher = eventPublisher;
        this.config = config;
        this.logger = new common_1.Logger(this.constructor.name);
        this.pendingEvents = [];
    }
    async save(entity, options) {
        const entities = Array.isArray(entity) ? entity : [entity];
        const isNewEntity = entities.some((e) => !e.id);
        try {
            const result = await this.repository.save(entity, options);
            if (isNewEntity && this.config.publishOnCreate) {
                const entitiesToEmit = Array.isArray(result) ? result : [result];
                for (const e of entitiesToEmit) {
                    if (!e.id)
                        continue;
                    const event = this.createEventForEntity(e, this.config.eventTypeOnCreate, 'create');
                    this.pendingEvents.push(event);
                    await this.eventPublisher.publishEventAndQueue(event);
                }
            }
            if (!isNewEntity && this.config.publishOnUpdate) {
                const entitiesToEmit = Array.isArray(result) ? result : [result];
                for (const e of entitiesToEmit) {
                    const event = this.createEventForEntity(e, this.config.eventTypeOnUpdate, 'update');
                    this.pendingEvents.push(event);
                    await this.eventPublisher.publishEventAndQueue(event);
                }
            }
            return result;
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.logger.error(`Error saving ${this.config.entityName}: ${errorMessage}`);
            throw error;
        }
    }
    async remove(entity, options) {
        if (this.config.publishOnDelete) {
            const entities = Array.isArray(entity) ? entity : [entity];
            for (const e of entities) {
                const event = this.createEventForEntity(e, this.config.eventTypeOnDelete, 'delete');
                this.pendingEvents.push(event);
                await this.eventPublisher.publishEventAndQueue(event);
            }
        }
        return this.repository.remove(entity, options);
    }
    createEventForEntity(entity, eventType, operation) {
        const anyEntity = entity;
        const aggregateId = anyEntity.id || anyEntity.tenant_id || 'unknown';
        let eventData = {
            [this.getEntityIdFieldName(anyEntity)]: aggregateId,
        };
        if (this.config.eventDataExtractor) {
            eventData = {
                ...eventData,
                ...this.config.eventDataExtractor(entity),
            };
        }
        return {
            eventType,
            eventId: this.generateId(),
            aggregateId,
            aggregateType: this.config.entityName,
            tenantId: anyEntity.tenant_id || anyEntity.tenantId,
            userId: anyEntity.user_id || anyEntity.userId,
            timestamp: new Date(),
            version: 1,
            data: eventData,
            metadata: {
                correlationId: this.generateId(),
                source: process.env.SERVICE_NAME || 'unknown-service',
            },
        };
    }
    getPendingEvents() {
        return [...this.pendingEvents];
    }
    clearPendingEvents() {
        this.pendingEvents = [];
    }
    async publishPendingEvents() {
        if (this.pendingEvents.length === 0) {
            return;
        }
        try {
            await this.eventPublisher.publishEventsBatch(this.pendingEvents);
            this.clearPendingEvents();
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.logger.error(`Error publishing pending events: ${errorMessage}`);
            throw error;
        }
    }
    getEntityIdFieldName(entity) {
        if (entity.id)
            return 'id';
        if (entity.tenant_id)
            return 'tenant_id';
        if (entity.tenantId)
            return 'tenantId';
        return 'id';
    }
    generateId() {
        return require('crypto').randomUUID?.() || Math.random().toString(36).substr(2);
    }
    find(options) {
        return this.repository.find(options);
    }
    findOne(options) {
        return this.repository.findOne(options);
    }
    findBy(where) {
        return this.repository.findBy(where);
    }
    findOneBy(where) {
        return this.repository.findOneBy(where);
    }
    count(options) {
        return this.repository.count(options);
    }
    update(criteria, partialEntity) {
        return this.repository.update(criteria, partialEntity);
    }
    delete(criteria) {
        return this.repository.delete(criteria);
    }
    createQueryBuilder(alias) {
        return this.repository.createQueryBuilder(alias);
    }
}
exports.EventEmittingRepository = EventEmittingRepository;
//# sourceMappingURL=event-emitting.repository.js.map