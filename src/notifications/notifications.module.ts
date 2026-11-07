import { Global, Module } from '@nestjs/common';
import { NotificationClient } from './notification.client';

/**
 * Gives a service the `NotificationClient`. Needs `EventsModule` and `SharedConfigModule` (both global).
 *
 * @example
 * imports: [SharedConfigModule, EventsModule, NotificationsModule]
 */
@Global()
@Module({
  providers: [NotificationClient],
  exports: [NotificationClient],
})
export class NotificationsModule {}
