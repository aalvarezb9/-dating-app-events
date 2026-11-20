import { isValidServiceNamespace } from './service-namespace';
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
  /** ACL user (Redis 6+): managed Redis gives one besides the password; locally there is none */
  username?: string;
  password?: string;
  /** TLS to the server (`rediss://`): every managed Redis asks for it */
  tls: boolean;
}

/** Where the topics and queues are: derived names live in `messaging/names.ts`, the only place that builds them */
export interface MessagingConfig {
  region: string;
  /** 12-digit AWS account (the emulator uses 000000000000): part of every topic and queue ARN */
  accountId: string;
  /** `local` (emulator), `dev` or `prod`: suffix of every topic and queue name */
  stage: string;
  /** Namespace of THIS service (`sch`): its own topic is `<namespace>-events-<stage>` */
  namespace: string;
  /** Only locally (the emulator); in AWS the SDK finds the endpoints by itself */
  endpoint?: string;
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
      username: this.configService.get('REDIS_USERNAME') || undefined, // Opcional
      password: this.configService.get('REDIS_PASSWORD'), // Opcional
      tls: this.getFlag('REDIS_TLS'), // Opcional: apagado por defecto (Redis local)
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
   * SNS / SQS: region, account, stage and namespace. `AWS_ENDPOINT_URL` is set only against the emulator.
   */
  get messaging(): MessagingConfig {
    return {
      region: this.getRequired('AWS_REGION'),
      accountId: this.getRequired('AWS_ACCOUNT_ID'),
      stage: this.getRequired('STAGE'),
      namespace: this.serviceNamespace,
      endpoint: this.get('AWS_ENDPOINT_URL') || undefined,
    };
  }

  /** An optional on/off switch: only the text "true" turns it on */
  private getFlag(key: string): boolean {
    return this.configService.get<string>(key)?.trim().toLowerCase() === 'true';
  }

  /**
   * Short abbreviation of the service (e.g. "bo"): prefix of every table of the service
   * (ServiceNamingStrategy) and actor of system writes ("system:bo"). Validated on access.
   */
  get serviceNamespace(): string {
    const namespace = this.getRequired('SERVICE_NAMESPACE');
    if (!isValidServiceNamespace(namespace)) {
      throw new Error(
        `Invalid SERVICE_NAMESPACE "${namespace}": use a short lowercase abbreviation (2-6 chars, e.g. "bo").`,
      );
    }
    return namespace;
  }

  /**
   * Full name of the service (e.g. "backend-dating-business-owner"): the "source" of published events.
   * Transitional: services that have not defined SERVICE_NAME yet keep using SERVICE_NAMESPACE.
   */
  get serviceName(): string {
    return this.get('SERVICE_NAME') || this.get('SERVICE_NAMESPACE') || 'backend-service';
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
