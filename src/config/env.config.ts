import { isValidServiceNamespace } from './service-namespace';
import { Injectable } from '@nestjs/common';
import { ConfigService as NestConfigService } from '@nestjs/config';

export interface DatabaseConfig {
  url: string;
}

/** The User Pool of Cognito that identifies the people of the platform (only `auth` has permission on it; the rest verify tokens) */
export interface CognitoConfig {
  region: string;
  userPoolId: string;
  /** The app client: only the admin password flow and the refresh flow are enabled (nobody can ask the provider for a token directly) */
  clientId: string;
  /** Optional: a refresh with a secret needs the user to compute the hash, which the contract of `refreshToken` does not carry */
  clientSecret?: string;
  /** `iss` of its tokens: `https://cognito-idp.<region>.amazonaws.com/<pool>` in AWS, what the emulator reports locally */
  issuer: string;
  /** Where the public keys are: `<issuer>/.well-known/jwks.json` */
  jwksUrl: string;
  /** Only locally (the emulator); in AWS the SDK finds the endpoint by itself */
  endpoint?: string;
}

/** Files in S3 (STORAGE_PROVIDER=s3). The logical name of a bucket (`payment-proofs`) is what the code uses; the real one is `<prefix><name>` */
export interface S3Config {
  region: string;
  /** Prepended to every bucket name: bucket names are global in AWS (`bookly-dev-`), and one stage must not touch another */
  bucketPrefix: string;
  /** Where the public files are served from (CloudFront in AWS): the public URL of a file is `<assetsBaseUrl>/<bucket>/<path>` */
  assetsBaseUrl: string;
  /** Only locally (the emulator); it also turns on path-style addressing */
  endpoint?: string;
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
  /** The port of the HTTP server: required where there is one (`main.ts`); read lazily so that a Lambda, which has no port, never asks for it */
  readonly port: number;
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
   * Cognito (AUTH_PROVIDER=cognito). `COGNITO_ISSUER` and `COGNITO_JWKS_URL` are only set when they are not the ones of AWS (the emulator
   * reports its own address as the issuer); without them they are derived from the region and the pool.
   */
  get cognito(): CognitoConfig {
    const region = this.getRequired('AWS_REGION');
    const userPoolId = this.getRequired('COGNITO_USER_POOL_ID');
    const issuer = this.get('COGNITO_ISSUER') || `https://cognito-idp.${region}.amazonaws.com/${userPoolId}`;
    return {
      region,
      userPoolId,
      clientId: this.getRequired('COGNITO_CLIENT_ID'),
      clientSecret: this.get('COGNITO_CLIENT_SECRET') || undefined,
      issuer,
      jwksUrl: this.get('COGNITO_JWKS_URL') || `${issuer}/.well-known/jwks.json`,
      endpoint: this.get('AWS_ENDPOINT_URL') || undefined,
    };
  }

  /** Which identity provider the platform uses (`cognito`): there is no default, a service that does not say fails at startup */
  get authProvider(): string {
    return this.getRequired('AUTH_PROVIDER');
  }

  /** Which file storage the platform uses (`s3`): there is no default */
  get storageProvider(): string {
    return this.getRequired('STORAGE_PROVIDER');
  }

  /** Files in S3: region, bucket prefix and the base URL the public files are served from */
  get s3(): S3Config {
    return {
      region: this.getRequired('AWS_REGION'),
      bucketPrefix: this.getRequired('S3_BUCKET_PREFIX'),
      assetsBaseUrl: this.getRequired('ASSETS_BASE_URL').replace(/\/+$/, ''),
      endpoint: this.get('AWS_ENDPOINT_URL') || undefined,
    };
  }

  /** Secret with which `auth` signs the tokens of a support session (HS256); no other token is verified with it */
  get supportTokenSecret(): string {
    return this.getRequired('SUPPORT_TOKEN_SECRET');
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
    const nodeEnv = this.getRequired('NODE_ENV');
    // Without checking certificates anybody in the middle could pass for the identity provider or for a service: only the local
    // environment (whose emulator has a certificate for `localhost` only) and the tests may switch it off
    if (this.get('NODE_TLS_REJECT_UNAUTHORIZED') === '0' && !['local', 'test'].includes(nodeEnv)) {
      throw new Error(`NODE_TLS_REJECT_UNAUTHORIZED=0 is only allowed with NODE_ENV=local or test (NODE_ENV is "${nodeEnv}")`);
    }
    // A function of AWS has no port (the server is API Gateway): `PORT` is only required when something asks for it, which only `main.ts` does
    const required = (name: string) => this.getRequired(name);
    return {
      get port() {
        return parseInt(required('PORT'));
      },
      nodeEnv,
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
