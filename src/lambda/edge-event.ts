import { REQUEST_ID_HEADER } from '../common/utils/request-trace';

/** The part of an event of an HTTP API (payload 2.0) that this file reads and rewrites */
export interface HttpApiEvent {
  rawPath?: string;
  headers?: Record<string, string | undefined>;
  requestContext?: {
    requestId?: string;
    authorizer?: unknown;
    http?: { path?: string };
  };
}

/** `/api/v1` is the global prefix of every service; the edge adds the name of the service after it (`/api/v1/user/public/...`) */
const API_PREFIX = '/api/v1';

/**
 * What the edge of the cloud puts on a request that the service would not see through its own address, undone before Nest reads it.
 * The edge (`backend-dating-api-gateway/serverless.edge.yml`) routes by the name of the service (`/api/v1/user/me/appointments`)
 * and the services answer without it (`/api/v1/me/appointments`), as the local gateway does when it forwards. The HTTP API of AWS
 * cannot rewrite the path of a request that goes to a Lambda, so the function does it.
 *
 * - `prefix` (`EDGE_PATH_PREFIX`, e.g. `user`): `/api/v1/user/x` becomes `/api/v1/x`. A path that does not start with it is left as it
 *   is, which is what a call from another service (to the address of the function itself) looks like. Auth does not set it: its
 *   own controllers already live under `/api/v1/auth`.
 * - A request that comes through the edge carries the identity of the authorizer: its `X-Request-Id` is the id API Gateway gave it
 *   (the client does not choose it). A call that does not come through the edge keeps the one the caller sent.
 *
 * It returns a new event; the one it receives is not changed.
 */
export function fromEdge<T extends HttpApiEvent>(event: T, prefix: string | undefined): T {
  const path = event.rawPath;
  const base = prefix ? `${API_PREFIX}/${prefix}/` : undefined;
  const strip = path !== undefined && base !== undefined && path.startsWith(base);
  const fromEdge = event.requestContext?.authorizer !== undefined;
  const requestId = event.requestContext?.requestId;
  if (!strip && !(fromEdge && requestId)) {
    return event;
  }

  const rewritten = strip ? `${API_PREFIX}/${path.slice(base.length)}` : path;
  return {
    ...event,
    rawPath: rewritten,
    headers: fromEdge && requestId ? { ...event.headers, [REQUEST_ID_HEADER]: requestId } : event.headers,
    requestContext: event.requestContext ? { ...event.requestContext, http: event.requestContext.http ? { ...event.requestContext.http, path: rewritten } : undefined } : undefined,
  };
}
