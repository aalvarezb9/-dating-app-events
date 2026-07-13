import { DomainEventType } from '../types/events';

/**
 * Metadata key for emitable entities
 */
const EMITABLE_METADATA_KEY = Symbol('emitable');
const EVENT_HANDLERS_METADATA_KEY = Symbol('eventHandlers');

/**
 * Decorator to mark an entity as emitting events
 *
 * @example
 * @Emitable({
 *   onCreate: DomainEventType.USER_REGISTERED,
 *   onUpdate: DomainEventType.USER_PROFILE_UPDATED,
 *   onDelete: DomainEventType.USER_DELETED,
 * })
 * export class User {
 *   @EventField() id: string;
 *   @EventField() email: string;
 * }
 */
export interface EmitableConfig {
  onCreate?: DomainEventType;
  onUpdate?: DomainEventType;
  onDelete?: DomainEventType;
  entityName?: string;
}

export function Emitable(config: EmitableConfig) {
  return function <T extends { new (...args: any[]): {} }>(constructor: T) {
    Reflect.defineMetadata(EMITABLE_METADATA_KEY, config, constructor);
    return constructor;
  };
}

/**
 * Decorator to mark fields that should be included in emitted events
 *
 * @example
 * @Emitable(...)
 * export class User {
 *   @EventField() id: string;
 *   @EventField() email: string;
 *   @EventField('ownerName') first_name: string; // Map to different name
 *   password: string; // Not included in event
 * }
 */
export function EventField(eventName?: string) {
  return function (target: any, propertyKey: string) {
    const fields =
      Reflect.getOwnMetadata(EVENT_HANDLERS_METADATA_KEY, target) || {};
    fields[propertyKey] = eventName || propertyKey;
    Reflect.defineMetadata(EVENT_HANDLERS_METADATA_KEY, fields, target);
  };
}

/**
 * Get emitable configuration from class
 */
export function getEmitableConfig(target: any): EmitableConfig | undefined {
  return Reflect.getMetadata(EMITABLE_METADATA_KEY, target);
}

/**
 * Get event fields from class
 */
export function getEventFields(target: any): Record<string, string> | {} {
  return Reflect.getMetadata(EVENT_HANDLERS_METADATA_KEY, target) || {};
}

/**
 * Extract event data from entity based on @EventField decorators
 */
export function extractEventData(entity: any): Record<string, any> {
  const constructor = entity.constructor;
  const eventFields = getEventFields(constructor);

  if (Object.keys(eventFields).length === 0) {
    // If no @EventField decorators, include all non-function properties
    return Object.keys(entity)
      .filter((key) => typeof entity[key] !== 'function')
      .reduce((acc, key) => {
        acc[key] = entity[key];
        return acc;
      }, {} as Record<string, any>);
  }

  // Include only fields marked with @EventField
  return Object.keys(eventFields).reduce((acc: Record<string, any>, key: string) => {
    const eventName = (eventFields as Record<string, string>)[key];
    if (key in entity) {
      acc[eventName] = entity[key];
    }
    return acc;
  }, {});
}
