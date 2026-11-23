/**
 * `@dating-app/events/edge`: the light entry of the library, for a service that stands at the edge (the API
 * gateway). The main entry loads everything (TypeORM, Supabase, the AWS SDK, Passport…) because the services need it; a
 * gateway needs none of that, and every package it carries is attack surface in the most exposed service.
 *
 * Only what depends on NestJS and the standard library goes here. Do NOT export from this file anything that
 * imports `typeorm`, `@supabase/supabase-js`, `@aws-sdk/*`, `passport-jwt`, `@nestjs/swagger` or `class-validator`:
 * `edge.contract.spec`-style checks in the gateway fail when the entry starts loading them.
 */

// Configuration (SharedConfigService reads the environment; nothing else may)
export * from './config/env.config';
export * from './config/connections';
export * from './config/shared-config.module';

// Who a route is for
export * from './common/types/auth.types';
export * from './common/decorators/public.decorator';
export * from './common/decorators/roles.decorator';
export * from './common/decorators/current-user.decorator';
export * from './common/guards/roles.guard';

// What the services record in the shared cache, to cut a token at the edge
export * from './auth/tenant-block';
export * from './auth/admin-session';
export * from './auth/support-session';

// The verifier of access tokens (Cognito and support sessions): `jose` only, no Passport nor AWS SDK
export * from './auth/token-verifier';

// Logs without secrets, and the shape of an error
export * from './common/utils/redact';
export * from './common/filters/all-exceptions.filter';
export * from './common/interfaces/api-response.interface';
