import { DomainEventType } from '../types/events';
export interface EmitableConfig {
    onCreate?: DomainEventType;
    onUpdate?: DomainEventType;
    onDelete?: DomainEventType;
    entityName?: string;
}
export declare function Emitable(config: EmitableConfig): <T extends {
    new (...args: any[]): {};
}>(constructor: T) => T;
export declare function EventField(eventName?: string): (target: any, propertyKey: string) => void;
export declare function getEmitableConfig(target: any): EmitableConfig | undefined;
export declare function getEventFields(target: any): Record<string, string> | {};
export declare function extractEventData(entity: any): Record<string, any>;
//# sourceMappingURL=emitable.decorator.d.ts.map