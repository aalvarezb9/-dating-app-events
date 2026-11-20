import { RedisConfig } from './env.config';

/**
 * How to reach Redis, in the shape the clients take. A Redis in the cloud asks for TLS; locally it is not set and the options are
 * the plain host and port. Every client of the platform builds its connection from here, so the cloud setting is one set of
 * environment variables, not a change in each service.
 */

/** Options for ioredis */
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
