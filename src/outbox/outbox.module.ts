import { DynamicModule, Global, Module } from '@nestjs/common';
import { OutboxService } from './outbox.service';
import { OutboxRelay, OUTBOX_OPTIONS, OutboxOptions } from './outbox-relay.service';
import { OutboxAdminController } from './outbox-admin.controller';

/**
 * Transactional outbox: `OutboxService.enqueue(manager, event)` saves the event together with
 * the change; `OutboxRelay` publishes it to Kafka. It also exposes `/internal/v1/outbox/*`
 * (OutboxAdminController) to watch the queue and retry the parked events.
 *
 * Requirements in the service: TypeOrmModule configured with `...OUTBOX_ENTITIES` in `entities`,
 * EventsModule (EventPublisher) and SharedConfigModule.
 *
 * @example
 * ```typescript
 * imports: [OutboxModule.forRoot()]
 * // events that carry a secret (a token): blanked once delivered
 * imports: [OutboxModule.forRoot({ redact: { EMAIL_VERIFICATION_REQUESTED: ['data.token'] } })]
 * ```
 */
@Global()
@Module({})
export class OutboxModule {
  static forRoot(options: OutboxOptions = {}): DynamicModule {
    return {
      module: OutboxModule,
      controllers: [OutboxAdminController],
      providers: [{ provide: OUTBOX_OPTIONS, useValue: options }, OutboxService, OutboxRelay],
      exports: [OutboxService, OutboxRelay],
    };
  }
}
