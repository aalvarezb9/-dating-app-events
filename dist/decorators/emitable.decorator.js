"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Emitable = Emitable;
exports.EventField = EventField;
exports.getEmitableConfig = getEmitableConfig;
exports.getEventFields = getEventFields;
exports.extractEventData = extractEventData;
const EMITABLE_METADATA_KEY = Symbol('emitable');
const EVENT_HANDLERS_METADATA_KEY = Symbol('eventHandlers');
function Emitable(config) {
    return function (constructor) {
        Reflect.defineMetadata(EMITABLE_METADATA_KEY, config, constructor);
        return constructor;
    };
}
function EventField(eventName) {
    return function (target, propertyKey) {
        const fields = Reflect.getOwnMetadata(EVENT_HANDLERS_METADATA_KEY, target) || {};
        fields[propertyKey] = eventName || propertyKey;
        Reflect.defineMetadata(EVENT_HANDLERS_METADATA_KEY, fields, target);
    };
}
function getEmitableConfig(target) {
    return Reflect.getMetadata(EMITABLE_METADATA_KEY, target);
}
function getEventFields(target) {
    return Reflect.getMetadata(EVENT_HANDLERS_METADATA_KEY, target) || {};
}
function extractEventData(entity) {
    const constructor = entity.constructor;
    const eventFields = getEventFields(constructor);
    if (Object.keys(eventFields).length === 0) {
        return Object.keys(entity)
            .filter((key) => typeof entity[key] !== 'function')
            .reduce((acc, key) => {
            acc[key] = entity[key];
            return acc;
        }, {});
    }
    return Object.keys(eventFields).reduce((acc, key) => {
        const eventName = eventFields[key];
        if (key in entity) {
            acc[eventName] = entity[key];
        }
        return acc;
    }, {});
}
//# sourceMappingURL=emitable.decorator.js.map