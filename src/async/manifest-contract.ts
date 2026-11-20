import { Type } from '@nestjs/common';
import { DomainEventType } from '../types/events';
import type { ConsumersManifest } from '../serverless/queue-resources';
import { routesOf } from './consume';

/**
 * What a service hands to `manifestProblems` from its contract spec: the places that say what a queue of the service takes.
 */
export interface ManifestContractInput {
  /** `src/async/consumers.manifest.json` */
  manifest: ConsumersManifest;
  /** The consumer class of every key of the manifest */
  consumers: Record<string, Type<unknown>>;
  /** What `src/async/queues.ts` exports (`import * as queues from './queues'`) */
  functions: Record<string, unknown>;
  /** The text of `serverless.yml` and of `serverless/queues.js` */
  serverlessYml: string;
  queuesHelperJs: string;
}

const pascal = (key: string): string => key.charAt(0).toUpperCase() + key.slice(1);

/**
 * The places that say what a queue takes must agree: the manifest (what the queue is subscribed to), the `@EventPattern`s of
 * the consumer class (what it handles), `queues.ts` (the function that reads it) and `serverless.yml` (that wires it up).
 * If they drift, a message is either never delivered or lands in a queue whose consumer has no method for it.
 *
 * @returns what disagrees, in words; empty when everything does. Use it as `expect(manifestProblems(...)).toEqual([])`.
 */
export function manifestProblems(input: ManifestContractInput): string[] {
  const { manifest, consumers, functions, serverlessYml, queuesHelperJs } = input;
  const problems: string[] = [];
  const keys = Object.keys(manifest.consumers);
  const known = new Set<string>(Object.values(DomainEventType));

  for (const key of keys.filter((k) => !consumers[k])) problems.push(`"${key}" is in the manifest but the spec gives no consumer class for it`);
  for (const key of Object.keys(consumers).filter((k) => !manifest.consumers[k])) problems.push(`${consumers[key].name} is not in the manifest as "${key}"`);

  for (const key of keys) {
    const spec = manifest.consumers[key];

    for (const event of spec.events) {
      if (!known.has(event)) problems.push(`"${key}": ${event} is not an event type`);
    }

    if (consumers[key]) {
      const handled = [...routesOf(consumers[key]).keys()].sort();
      const declared = [...spec.events].sort();
      if (JSON.stringify(handled) !== JSON.stringify(declared)) {
        problems.push(`"${key}": the manifest takes [${declared}] but ${consumers[key].name} handles [${handled}] with @EventPattern`);
      }
    }

    if (typeof functions[`process${pascal(key)}`] !== 'function') problems.push(`"${key}": queues.ts does not export process${pascal(key)}`);
    if (!serverlessYml.includes(`handler: dist/async/queues.process${pascal(key)}`)) problems.push(`"${key}": serverless.yml has no function with handler dist/async/queues.process${pascal(key)}`);
    if (!serverlessYml.includes(`[${pascal(key)}Queue, Arn]`)) problems.push(`"${key}": serverless.yml does not read ${pascal(key)}Queue`);
  }

  const expected = new Set(keys.map((key) => `process${pascal(key)}`));
  for (const name of Object.keys(functions).filter((name) => !expected.has(name))) {
    problems.push(`queues.ts exports ${name}, which has no entry in the manifest`);
  }

  const ymlTimeout = /^ {2}timeout: (\d+)\b/m.exec(serverlessYml)?.[1];
  const helperTimeout = /functionTimeout: (\d+)\b/.exec(queuesHelperJs)?.[1];
  if (!ymlTimeout || ymlTimeout !== helperTimeout) {
    problems.push(`the timeout of the functions in serverless.yml (${ymlTimeout}) is not the functionTimeout of serverless/queues.js (${helperTimeout}): the queues hide a message for 6 times that`);
  }

  return problems;
}
