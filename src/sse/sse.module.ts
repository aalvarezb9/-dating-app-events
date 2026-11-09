import { DynamicModule, Global, Module, Provider, Type } from '@nestjs/common';
import { SseController } from './sse.controller';
import { SseHub } from './sse.hub';
import { SseService } from './sse.service';
import { SseSettings } from './sse.settings';

export interface SseModuleOptions {
  /**
   * true: this service also SERVES the stream (`GET /sse/stream`) to the UI. Only the service that is public
   * (users) does, and it then needs the `SSE_*` variables. Default: it only emits.
   */
  serve?: boolean;
}

/**
 * Real-time signals for the UI.
 *
 * @example
 * // A service that only emits (schedule): sse.emit('agenda.salon.no-team.2030-06-20', { ... })
 * imports: [SharedConfigModule, SseModule.forRoot()]
 *
 * // The service that serves the stream to the browsers (users)
 * imports: [SharedConfigModule, SseModule.forRoot({ serve: true })]
 *
 * Needs `SharedConfigModule` (global) and `ioredis` in the service.
 */
@Global()
@Module({})
export class SseModule {
  static forRoot(options: SseModuleOptions = {}): DynamicModule {
    const providers: Provider[] = [SseService];
    const controllers: Type<unknown>[] = [];

    if (options.serve) {
      providers.push(SseSettings, SseHub);
      controllers.push(SseController);
    }

    return { module: SseModule, global: true, providers, controllers, exports: [SseService] };
  }
}
