import { Global, Module } from '@nestjs/common';
import { RealtimeClient } from './realtime.client';

/**
 * Gives a service the `RealtimeClient`. Needs `SharedConfigModule` (global).
 *
 * @example
 * imports: [SharedConfigModule, RealtimeModule]
 */
@Global()
@Module({
  providers: [RealtimeClient],
  exports: [RealtimeClient],
})
export class RealtimeModule {}
