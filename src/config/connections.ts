import { KafkaConfig, KafkaSasl, RedisConfig } from './env.config';

/**
 * How to reach Kafka and Redis, in the shape the clients take. A broker or a Redis in the cloud asks for TLS (and Kafka
 * for SASL); locally neither is set and the options are the plain host and port. Every client of the platform builds its
 * connection from here, so the cloud setting is one set of environment variables, not a change in each service.
 */

/** The part of a kafkajs client that says where the brokers are and how to log in to them */
export interface KafkaConnection {
  brokers: string[];
  ssl?: true;
  sasl?: KafkaSasl;
}

/** `{ brokers, ssl?, sasl? }` to spread into `new Kafka({ ... })` or into the `client` options of a Nest Kafka transport */
export function kafkaClientConnection(kafka: Pick<KafkaConfig, 'brokers' | 'ssl' | 'sasl'>): KafkaConnection {
  return {
    brokers: kafka.brokers,
    ...(kafka.ssl ? { ssl: true as const } : {}),
    ...(kafka.sasl ? { sasl: kafka.sasl } : {}),
  };
}

/** Options for ioredis and for the `connection` of BullMQ */
export interface RedisConnectionOptions {
  host: string;
  port: number;
  username?: string;
  password?: string;
  tls?: Record<string, never>;
}

export function redisConnectionOptions(redis: RedisConfig): RedisConnectionOptions {
  return {
    host: redis.host,
    port: redis.port,
    ...(redis.username ? { username: redis.username } : {}),
    ...(redis.password ? { password: redis.password } : {}),
    ...(redis.tls ? { tls: {} } : {}),
  };
}

/** `redis://` or `rediss://` URL, for the clients that take one (Keyv) */
export function redisUrl(redis: RedisConfig): string {
  const user = redis.username ? encodeURIComponent(redis.username) : '';
  const password = redis.password ? `:${encodeURIComponent(redis.password)}` : '';
  const credentials = user || password ? `${user}${password}@` : '';
  return `${redis.tls ? 'rediss' : 'redis'}://${credentials}${redis.host}:${redis.port}`;
}
