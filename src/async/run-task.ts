import { INestApplicationContext, Logger, Type } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { loadSecrets } from '../config/load-secrets';
import { RuntimeInfo } from '../runtime/runtime-info';

/**
 * The entry of a function that runs a task of a service on a schedule (an EventBridge rule) or when somebody invokes it:
 * `export const reconcileCatalog = runTask(AppModule, CatalogSyncService, 'reconcile');`
 *
 * It replaces what a server did with a timer (`@Cron`, `setInterval`) or at startup: the function starts Nest once per instance (marked
 * as serverless), calls the method of the service and finishes. The method is called with no arguments (the event of the rule is
 * not handed to it); if it throws, the invocation fails and AWS records it.
 */
export function runTask<T>(appModule: Type<unknown>, service: Type<T>, method: keyof T & string) {
  const logger = new Logger('runTask');
  let app: Promise<INestApplicationContext> | undefined;

  const context = (): Promise<INestApplicationContext> => {
    if (!app) {
      RuntimeInfo.markServerless();
      app = loadSecrets()
        .then(() => NestFactory.createApplicationContext(appModule, { logger: ['error', 'warn'] }))
        .catch((error) => {
          app = undefined; // a failed start is not kept: the next invocation tries again
          throw error;
        });
    }
    return app;
  };

  return async (): Promise<void> => {
    const instance = (await context()).get(service, { strict: false }) as Record<string, unknown>;
    const task = instance[method];
    if (typeof task !== 'function') {
      throw new Error(`${service.name} has no method ${method}`);
    }
    const started = Date.now();
    await task.call(instance);
    logger.log(`${service.name}.${method} finished in ${Date.now() - started} ms`);
  };
}
