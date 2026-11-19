import { DomainEventType } from '../types/events';

/**
 * Where an event type goes. By default it is announced on the topic of the service that emits it (`EventPublisher`). The only
 * exception is an order that must be decided in sequence: it belongs to the client of the service that owns its FIFO queue.
 */
export type EventRoute =
  | { kind: 'topic' }
  | { kind: 'client'; client: string };

const CLIENT_ROUTES: Partial<Record<DomainEventType, string>> = {
  [DomainEventType.APPOINTMENT_REQUEST_CREATED]: 'ScheduleClient',
};

export function routeOf(eventType: DomainEventType): EventRoute {
  const client = CLIENT_ROUTES[eventType];
  return client ? { kind: 'client', client } : { kind: 'topic' };
}
