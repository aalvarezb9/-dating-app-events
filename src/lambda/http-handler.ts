import { INestApplication, Type } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import serverlessExpress from '@codegenie/serverless-express';
import { loadSecrets } from '../config/load-secrets';
import { RuntimeInfo } from '../runtime/runtime-info';
import { fromEdge, HttpApiEvent } from './edge-event';

/**
 * The entry of the Lambda that serves the HTTP API of a service: `export const http = createHttpHandler(AppModule, configureApp);`
 *
 * API Gateway hands the function an HTTP request as an event; this turns it into a request to the same Express application that
 * Nest serves in a container, and the answer back into the response of the function. The controllers, guards, pipes and
 * interceptors do not know the difference.
 *
 * - Nest starts ONCE per instance, on its first request, and is reused by the next ones; a failed start is not kept.
 * - The application is configured by the service, with the same function its `main.ts` uses (prefix, helmet, pipes, interceptors),
 *   so the container and the Lambda cannot differ. It is told it runs in Lambda: there, CORS belongs to the API Gateway (a second
 *   set of headers from Nest would make the browser refuse the response) and there is no Swagger nor `listen`.
 */
export interface HttpRuntime {
  /** True here: the function is behind API Gateway, which answers CORS and terminates TLS */
  lambda: true;
}

export type ConfigureApp = (app: INestApplication, runtime?: HttpRuntime) => void | Promise<void>;

type LambdaHandler = (event: unknown, context: unknown) => Promise<unknown>;

export function createHttpHandler(appModule: Type<unknown>, configure?: ConfigureApp): LambdaHandler {
  let handler: Promise<LambdaHandler> | undefined;

  const boot = async (): Promise<LambdaHandler> => {
    RuntimeInfo.markServerless(); // before Nest starts: the startup tasks of the services read it
    await loadSecrets(); // the secrets of Secrets Manager (SECRETS_IDS) become variables before the configuration is read
    const app = await NestFactory.create(appModule, { logger: ['error', 'warn'] });
    await configure?.(app, { lambda: true });
    await app.init();

    const http = serverlessExpress({ app: app.getHttpAdapter().getInstance() });
    // `EDGE_PATH_PREFIX` is part of how the function is wired (serverless.yml), like the stage: the configuration of the application is not involved
    const prefix = process.env.EDGE_PATH_PREFIX || undefined;
    return (event, context) => http(fromEdge(event as HttpApiEvent, prefix) as never, context as never, () => undefined) as Promise<unknown>;
  };

  return async (event, context) => {
    handler ??= boot().catch((error) => {
      handler = undefined; // the next request tries again
      throw error;
    });
    return (await handler)(event, context);
  };
}
