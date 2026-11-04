import { DynamicModule, Global, Module } from '@nestjs/common';
import { OutboxService } from './outbox.service';
import { OutboxRelay, OUTBOX_OPTIONS, OutboxOptions } from './outbox-relay.service';

/**
 * Transactional outbox: `OutboxService.enqueue(manager, event)` saves the event together with
 * the change; `OutboxRelay` publishes it to Kafka.
 *
 * Requirements in the service: TypeOrmModule configured with `...OUTBOX_ENTITIES` in `entities`,
 * EventsModule (EventPublisher) and SharedConfigModule.
 *
 * @example
 * ```typescript
 * imports: [OutboxModule.forRoot()]
 * ```
 */
@Global()
@Module({})
export class OutboxModule {
  static forRoot(options: OutboxOptions = {}): DynamicModule {
    return {
      module: OutboxModule,
      providers: [{ provide: OUTBOX_OPTIONS, useValue: options }, OutboxService, OutboxRelay],
      exports: [OutboxService, OutboxRelay],
    };
  }
}
