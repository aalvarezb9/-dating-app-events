import { Injectable } from '@nestjs/common';
import { ConfigService as NestConfigService } from '@nestjs/config';

export interface DatabaseConfig {
  url: string;
}

export interface SupabaseConfig {
  url: string;
  anonKey: string;
  serviceRoleKey: string;
  jwtSecret: string;
  storageUrl: string;
}

export interface RedisConfig {
  host: string;
  port: number;
  password?: string;
}

export interface AppConfig {
  port: number;
  nodeEnv: string;
  baseDomain: string;
}

/**
 * Shared Configuration Service
 *
 * Centraliza el acceso a variables de entorno con validación obligatoria.
 *
 * REGLAS CRÍTICAS:
 * - NO usar process.env directamente en servicios
 * - NO usar valores por defecto (todas las variables deben existir en .env)
 * - Lanzar error si falta una variable requerida
 *
 * @example
 * ```typescript
 * @Injectable()
 * export class MyService {
 *   constructor(private config: SharedConfigService) {}
 *
 *   async connect() {
 *     // ✅ BIEN - Via SharedConfigService
 *     const redisConfig = this.config.redis;
 *     console.log(redisConfig.host, redisConfig.port);
 *
 *     // ❌ MAL - NO usar process.env directamente
 *     const host = process.env.REDIS_HOST || 'localhost';
 *   }
 * }
 * ```
 */
@Injectable()
export class SharedConfigService {
  constructor(private configService: NestConfigService) {}

  /**
   * Database configuration
   */
  get database(): DatabaseConfig {
    return {
      url: this.getRequired('DATABASE_URL'),
    };
  }

  /**
   * Supabase configuration
   */
  get supabase(): SupabaseConfig {
    return {
      url: this.getRequired('SUPABASE_URL'),
      anonKey: this.getRequired('SUPABASE_ANON_KEY'),
      serviceRoleKey: this.getRequired('SUPABASE_SERVICE_ROLE_KEY'),
      jwtSecret: this.getRequired('SUPABASE_JWT_SECRET'),
      storageUrl: this.getRequired('SUPABASE_STORAGE_URL'),
    };
  }

  /**
   * Redis configuration
   */
  get redis(): RedisConfig {
    return {
      host: this.getRequired('REDIS_HOST'),
      port: parseInt(this.getRequired('REDIS_PORT')),
      password: this.configService.get('REDIS_PASSWORD'), // Opcional
    };
  }

  /**
   * App configuration
   */
  get app(): AppConfig {
    return {
      port: parseInt(this.getRequired('PORT')),
      nodeEnv: this.getRequired('NODE_ENV'),
      baseDomain: this.getRequired('BASE_DOMAIN'),
    };
  }

  /**
   * JWT Secret (separate from Supabase JWT)
   */
  get jwtSecret(): string {
    return this.getRequired('JWT_SECRET');
  }

  /**
   * Get optional environment variable
   */
  get(key: string): string | undefined {
    return this.configService.get<string>(key);
  }

  /**
   * Get required environment variable
   * Throws error if not found
   */
  private getRequired(key: string): string {
    const value = this.configService.get<string>(key);
    if (!value) {
      throw new Error(
        `Missing required environment variable: ${key}. ` +
        `Please add it to your .env file.`
      );
    }
    return value;
  }
}
