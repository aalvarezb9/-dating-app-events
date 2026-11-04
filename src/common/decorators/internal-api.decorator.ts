import { applyDecorators, SetMetadata, UseGuards } from '@nestjs/common';
import { CROSS_TENANT_KEY } from './cross-tenant.decorator';
import { InternalApiKeyGuard } from '../guards/internal-api-key.guard';

export const IS_INTERNAL_API_KEY = 'isInternalApi';

/**
 * Marks an endpoint (or controller) as INTERNAL: called only by other services with the
 * inter-service API key, never by end users.
 *
 * - Skips the JWT guard (there is no user) but requires X-API-Key (InternalApiKeyGuard).
 * - Is cross-tenant: there is no tenant in the context, so the handler must filter by tenant
 *   explicitly (the repository will not).
 * - Must live under `/internal/...` and must NOT be exposed by the API gateway.
 *
 * It is not @Public(): a service can tell public endpoints (none, except health) from internal ones.
 */
export const InternalApi = () =>
  applyDecorators(
    SetMetadata(IS_INTERNAL_API_KEY, true),
    SetMetadata(CROSS_TENANT_KEY, true),
    UseGuards(InternalApiKeyGuard),
  );
