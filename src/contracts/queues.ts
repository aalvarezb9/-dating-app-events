/**
 * The queues a service SENDS to directly, by logical name `<owner namespace>.<queue>`: only where an event on a topic is not
 * enough. Everything else is an event announced with `EventPublisher` and received by whoever subscribed a queue to the topic.
 *
 * - `sch.appointmentRequest`: FIFO, because two requests for the same slot must be decided in the order they arrived.
 * - `sch.reservationExpiry`: a message held back (SQS `DelaySeconds`) until the payment window of a reservation ends; SNS cannot delay.
 *
 * The owner is the service that consumes the queue and creates it (its `serverless.yml`); everybody else sends through the
 * client of that service (`ScheduleQueueClient`), never by the name.
 */
export interface QueueSpec {
  /** Namespace of the service that owns (consumes) the queue */
  readonly owner: string;
  /** The only FIFO queue is the one that decides the agenda: group = the slot's agenda, dedup = the request id */
  readonly fifo?: true;
  /** SQS holds a message back up to 900 seconds: the longest `delaySeconds` it accepts */
  readonly maxDelaySeconds?: number;
}

export const QUEUES = {
  'sch.appointmentRequest': { owner: 'sch', fifo: true },
  'sch.reservationExpiry': { owner: 'sch', maxDelaySeconds: 900 },
} as const satisfies Record<string, QueueSpec>;

export type QueueRef = keyof typeof QUEUES;
