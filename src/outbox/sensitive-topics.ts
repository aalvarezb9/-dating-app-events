import { ConfigResourceTypes, Kafka } from 'kafkajs';

const HOUR_MS = 3_600_000;

/**
 * Makes the topics of the events that carry a secret (a token) keep their messages for a short time only.
 *
 * Blanking the secret from the outbox is not enough: the message itself stays in the Kafka topic for the
 * retention of the broker (a week by default). Two settings are needed per topic:
 * - `retention.ms`: how long a message lives;
 * - `segment.ms`: Kafka only deletes CLOSED segments, and a quiet topic would keep one open for as long as
 *   its size limit allows (1 GB by default), so the segments are rolled at least every hour.
 *
 * Creating the topic here also makes sure it exists with these settings before the first message (otherwise
 * the broker auto-creates it with the defaults); for an existing topic the settings are applied to it.
 * A consumer that is down for longer than the retention misses the message: the secret is meant to be
 * delivered within that time (the person can ask for the link again).
 */
export async function ensureTopicRetention(
  brokers: string[],
  clientId: string,
  topics: string[],
  retentionHours: number,
): Promise<void> {
  if (topics.length === 0) {
    return;
  }

  const retentionMs = Math.round(retentionHours * HOUR_MS);
  const configEntries = [
    { name: 'retention.ms', value: String(retentionMs) },
    { name: 'segment.ms', value: String(Math.min(retentionMs, HOUR_MS)) },
  ];

  const admin = new Kafka({ brokers, clientId: `${clientId}-topic-admin`, retry: { retries: 3 } }).admin();
  await admin.connect();
  try {
    // false when a topic already exists (the settings are applied below either way)
    await admin.createTopics({
      waitForLeaders: true,
      topics: topics.map((topic) => ({ topic, configEntries })),
    });
    await admin.alterConfigs({
      validateOnly: false,
      resources: topics.map((name) => ({ type: ConfigResourceTypes.TOPIC, name, configEntries })),
    });
  } finally {
    await admin.disconnect().catch(() => undefined);
  }
}
