import { randomUUID } from 'crypto';
import { Injectable, Logger, OnModuleDestroy, OnModuleInit, ServiceUnavailableException } from '@nestjs/common';
import Redis from 'ioredis';
import { SharedConfigService } from '../config/env.config';
import { SSE_CHANNEL, SseEnvelope } from './sse.service';
import { SseSettings } from './sse.settings';
import { topicMatches, validateTopic } from './sse.topics';

/** Keys the UI translates */
export const SseErrors = {
  TOPICS_REQUIRED: 'sse.error.topics_required',
  INVALID_TOPIC: 'sse.error.invalid_topic',
  TOO_MANY_TOPICS: 'sse.error.too_many_topics',
  AT_CAPACITY: 'sse.error.at_capacity',
} as const;

/** What the hub needs from the HTTP request and response (Express provides it; a test can fake it) */
export interface SseRequest {
  on(event: 'close', listener: () => void): unknown;
}
export interface SseResponse {
  readonly writableEnded: boolean;
  readonly destroyed: boolean;
  readonly writableLength: number;
  setHeader(name: string, value: string): unknown;
  flushHeaders(): void;
  write(chunk: string): boolean;
  end(): unknown;
}

interface Connection {
  id: string;
  patterns: string[];
  response: SseResponse;
  timers: NodeJS.Timeout[];
}

/** How long the browser waits before it reconnects (the `retry` field of SSE), in milliseconds */
const RETRY_MS = 3000;

/** An SSE frame: the name of the event is the topic itself, so the UI can listen by name */
export const frameOf = (topic: string, data: Record<string, unknown>): string => `event: ${topic}\ndata: ${JSON.stringify(data)}\n\n`;

/**
 * Holds the SSE connections of THIS instance and writes to each one the signals it asked for.
 *
 * Every instance of every service that serves the stream hears every signal from Redis, so each one only deals
 * with its own connections. Nothing is stored: a connection that opens later hears only what happens from then on.
 *
 * A connection ends in any of three ways, and in all of them it is removed: the client leaves, it is too slow to
 * follow (disconnected), or it reaches the maximum lifetime (it says `reconnect` first and the browser opens a
 * new one). While open, a comment goes out every few seconds so no proxy sees an idle connection.
 */
@Injectable()
export class SseHub implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SseHub.name);
  private readonly connections = new Map<string, Connection>();
  private redis?: Redis;

  constructor(
    private readonly config: SharedConfigService,
    private readonly settings: SseSettings,
  ) {}

  get size(): number {
    return this.connections.size;
  }

  async onModuleInit(): Promise<void> {
    const { host, port, password } = this.config.redis;
    this.redis = new Redis({ host, port, password });
    this.redis.on('error', (error) => this.logger.warn(`Redis (SSE): ${error.message}`));
    this.redis.on('message', (_channel, message) => this.receive(message));
    await this.redis.subscribe(SSE_CHANNEL);
    this.logger.log(`Serving SSE: listening to the signals on ${SSE_CHANNEL}`);
  }

  async onModuleDestroy(): Promise<void> {
    for (const connection of [...this.connections.values()]) {
      this.close(connection);
    }
    await this.redis?.quit().catch(() => undefined);
  }

  /** @throws ServiceUnavailableException, before anything is written, when the instance is full */
  open(request: SseRequest, response: SseResponse, patterns: string[]): string {
    if (this.connections.size >= this.settings.maxConnections) {
      throw new ServiceUnavailableException(SseErrors.AT_CAPACITY);
    }

    const connection: Connection = { id: randomUUID(), patterns, response, timers: [] };
    this.connections.set(connection.id, connection);

    response.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    response.setHeader('Cache-Control', 'no-cache, no-transform');
    response.setHeader('Connection', 'keep-alive');
    response.setHeader('X-Accel-Buffering', 'no'); // nginx and friends must not hold the frames back
    response.flushHeaders();
    response.write(`retry: ${RETRY_MS}\n\n`);
    response.write(`event: ready\ndata: ${JSON.stringify({ patterns })}\n\n`);

    const heartbeat = setInterval(() => this.send(connection, ': keep-alive\n\n'), this.settings.heartbeatSeconds * 1000);
    const lifetime = setTimeout(() => {
      this.send(connection, 'event: reconnect\ndata: {}\n\n');
      this.close(connection);
    }, this.settings.maxConnectionSeconds * 1000);
    heartbeat.unref?.();
    lifetime.unref?.();
    connection.timers = [heartbeat, lifetime];

    request.on('close', () => this.close(connection));
    return connection.id;
  }

  /** Public so a test can feed a message without Redis */
  receive(message: string): void {
    let signal: SseEnvelope;
    try {
      signal = JSON.parse(message) as SseEnvelope;
    } catch {
      this.logger.warn('Dropped an SSE message that is not JSON');
      return;
    }
    const problem = validateTopic(signal?.topic);
    if (problem || typeof signal.data !== 'object' || signal.data === null || Array.isArray(signal.data)) {
      this.logger.warn(`Dropped an invalid SSE message: ${problem ?? 'the data must be an object'}`);
      return;
    }
    this.dispatch(signal);
  }

  /** @returns how many connections the signal was written to */
  dispatch(signal: SseEnvelope): number {
    const frame = frameOf(signal.topic, signal.data);
    let delivered = 0;
    for (const connection of [...this.connections.values()]) {
      if (connection.patterns.some((pattern) => topicMatches(pattern, signal.topic)) && this.send(connection, frame)) {
        delivered++;
      }
    }
    return delivered;
  }

  /** Writes a frame; a connection that is gone or too slow is closed instead */
  private send(connection: Connection, frame: string): boolean {
    const { response } = connection;
    if (response.writableEnded || response.destroyed || response.writableLength > this.settings.slowClientBytes) {
      this.close(connection);
      return false;
    }
    response.write(frame);
    return true;
  }

  private close(connection: Connection): void {
    if (!this.connections.delete(connection.id)) {
      return;
    }
    connection.timers.forEach(clearTimeout);
    if (!connection.response.writableEnded) {
      connection.response.end();
    }
  }
}
