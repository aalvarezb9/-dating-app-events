import { Module, Global } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
import { Keyv } from 'keyv';
import KeyvRedis from '@keyv/redis';
import { SharedConfigService } from '../config/env.config';

/**
 * Redis Cache Module
 *
 * Provides centralized Redis caching for all services.
 * Replaces AWS ElastiCache in the Railway + Supabase stack.
 *
 * Features:
 * - Global cache module (available across all modules)
 * - Redis-backed cache storage
 * - Automatic TTL management
 * - Type-safe cache operations
 *
 * @example
 * ```typescript
 * // In app.module.ts
 * @Module({
 *   imports: [
 *     SharedConfigModule,
 *     RedisCacheModule,
 *     ...
 *   ],
 * })
 * export class AppModule {}
 *
 * // In any service
 * @Injectable()
 * export class SubdomainService {
 *   constructor(@Inject(CACHE_MANAGER) private cacheManager: Cache) {}
 *
 *   async getSubdomain(slug: string) {
 *     const cacheKey = `subdomain:${slug}`;
 *     const cached = await this.cacheManager.get(cacheKey);
 *
 *     if (cached) {
 *       return cached;
 *     }
 *
 *     const subdomain = await this.repository.findBySlug(slug);
 *     await this.cacheManager.set(cacheKey, subdomain, 3600); // TTL: 1 hour
 *
 *     return subdomain;
 *   }
 *
 *   async invalidateSubdomain(slug: string) {
 *     await this.cacheManager.del(`subdomain:${slug}`);
 *   }
 * }
 * ```
 */
@Global()
@Module({})
export class RedisCacheModule {
  static forRoot() {
    return {
      module: RedisCacheModule,
      imports: [
        CacheModule.registerAsync({
          inject: [SharedConfigService],
          useFactory: async (config: SharedConfigService) => {
            const redisConfig = config.redis;

            // cache-manager v6 takes Keyv stores: the `store:` option of v5 is silently ignored and
            // the cache falls back to process memory. No namespace: keys are stored exactly as given.
            const auth = redisConfig.password ? `:${encodeURIComponent(redisConfig.password)}@` : '';
            const url = `redis://${auth}${redisConfig.host}:${redisConfig.port}`;

            return {
              stores: [new Keyv({ store: new KeyvRedis(url), namespace: '' })],
              ttl: 3600000, // Default TTL: 1 hour (in milliseconds)
            };
          },
        }),
      ],
      exports: [CacheModule],
    };
  }
}
