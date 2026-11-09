import { Injectable } from '@nestjs/common';
import { SharedConfigService } from '../config/env.config';

/**
 * The settings of the service that SERVES the stream (`SseModule.forRoot({ serve: true })`), read from the
 * environment. Like the rest of the library there are no hidden defaults: a missing or invalid variable stops
 * the service at startup, naming it. A service that only emits needs none of them.
 */
@Injectable()
export class SseSettings {
  /** Seconds between the keep-alive comments (below the idle timeout of any proxy) */
  readonly heartbeatSeconds: number;
  /** A connection is closed after this long, so the browser reconnects with fresh filters */
  readonly maxConnectionSeconds: number;
  /** Open connections one instance accepts: the next ones get 503 instead of bringing the instance down */
  readonly maxConnections: number;
  /** Patterns one connection may ask for */
  readonly maxTopicsPerConnection: number;
  /** A client with this many bytes waiting to be read is too slow: it is disconnected */
  readonly slowClientBytes: number;

  constructor(config: SharedConfigService) {
    const positive = (key: string): number => {
      const value = Number(config.get(key));
      if (!Number.isInteger(value) || value <= 0) {
        throw new Error(`${key} must be a positive integer`);
      }
      return value;
    };
    this.heartbeatSeconds = positive('SSE_HEARTBEAT_SECONDS');
    this.maxConnectionSeconds = positive('SSE_MAX_CONNECTION_SECONDS');
    this.maxConnections = positive('SSE_MAX_CONNECTIONS');
    this.maxTopicsPerConnection = positive('SSE_MAX_TOPICS_PER_CONNECTION');
    this.slowClientBytes = positive('SSE_SLOW_CLIENT_BYTES');
  }
}
