import { DynamicModule } from '@nestjs/common';
import { EventPublisherConfig } from './services/event-publisher.service';
export declare class EventsModule {
    static register(config: EventPublisherConfig): DynamicModule;
    static registerAsync(configFactory: () => Promise<EventPublisherConfig>): DynamicModule;
}
//# sourceMappingURL=events.module.d.ts.map