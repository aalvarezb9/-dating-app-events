import { readdirSync, statSync } from 'fs';
import { join } from 'path';
import { getMetadataArgsStorage } from 'typeorm';

/**
 * TypeORM finds the entities of a service by a file pattern (`**\/*.entity.js`). In a Lambda the code is one bundle and those files do
 * not exist: every request that touches the database fails with "No metadata for X was found". So the service lists its entities
 * (`src/database/entities.ts`) and gives that list to TypeORM; this finds the entity files of the service that the list forgot, so a
 * new entity cannot be left out and only fail once deployed.
 *
 * @param listed the classes the service gives to TypeORM
 * @param srcDir the `src` folder of the service
 * @returns the entities that exist in `srcDir` and are not in `listed`, with their file; empty when the list is complete.
 *          Use it as `expect(entitiesNotListed(ENTITIES, join(__dirname, '..'))).toEqual([])`.
 */
export function entitiesNotListed(listed: Function[], srcDir: string): string[] {
  const missing: string[] = [];

  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) {
        if (name !== 'node_modules') walk(path);
        continue;
      }
      if (!/\.entity\.(ts|js)$/.test(name)) continue;

      // eslint-disable-next-line @typescript-eslint/no-require-imports
      for (const exported of Object.values(require(path))) {
        const isEntity = typeof exported === 'function' && getMetadataArgsStorage().tables.some((table) => table.target === exported);
        if (isEntity && !listed.includes(exported as Function)) {
          missing.push(`${(exported as Function).name} (${path})`);
        }
      }
    }
  };

  walk(srcDir);
  return missing;
}
