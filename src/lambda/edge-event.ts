import { REQUEST_ID_HEADER } from '../common/utils/request-trace';

/** The part of an event of an HTTP API (payload 2.0) that this file reads and rewrites: what the function of a service receives from its own address */
export interface HttpApiEvent {
  rawPath?: string;
  headers?: Record<string, string | undefined>;
  requestContext?: {
    requestId?: string;
    authorizer?: unknown;
    http?: { path?: string };
  };
}

/** The part of an event of a REST API (payload 1.0) that this file reads and rewrites: what the function receives from the edge of the platform */
export interface RestApiEvent {
  path?: string;
  httpMethod?: string;
  headers?: Record<string, string | undefined> | null;
  multiValueHeaders?: Record<string, string[] | undefined> | null;
  requestContext?: {
    requestId?: string;
    stage?: string;
    authorizer?: unknown;
    http?: { path?: string };
  };
}

/** `/api/v1` is the global prefix of every service; the edge adds the name of the service after it (`/api/v1/user/public/...`) */
const API_PREFIX = '/api/v1';

/** The stage of the private REST API that the other services call (`deploy/cloud/internal`); the edge's stage is named after the environment */
export const INTERNAL_API_STAGE = 'internal';

const isRestEvent = (event: HttpApiEvent | RestApiEvent): event is RestApiEvent =>
  typeof (event as RestApiEvent).path === 'string' && typeof (event as RestApiEvent).httpMethod === 'string' && (event as HttpApiEvent).rawPath === undefined;

/**
 * What the edge of the cloud puts on a request that the service would not see through its own address, undone before Nest reads it.
 * The edge (the managed API Gateway of `deploy/cloud/edge`) routes by the name of the service (`/api/v1/user/me/appointments`) and the
 * services answer without it (`/api/v1/me/appointments`), as the local gateway does when it forwards. API Gateway cannot rewrite the path
 * of a request that goes to a Lambda, so the function does it.
 *
 * - `prefix` (`EDGE_PATH_PREFIX`, e.g. `user`): `/api/v1/user/x` becomes `/api/v1/x`. A path that does not start with it is left as it
 *   is, which is what a call from another service (to the address of the function itself) looks like. Auth does not set it: its
 *   own controllers already live under `/api/v1/auth`. It is never applied to a call between services (stage `internal`).
 * - A request that comes through the edge carries an id that API Gateway gave it (the client does not choose it), and it becomes the
 *   `X-Request-Id`. The edge is a REST API (payload 1.0): an event of that shape can only come from it, because the HTTP API of each
 *   service (payload 2.0) is not the edge. An HTTP API event counts as coming from the edge only if an authorizer ran (the edge used to be
 *   one). The other services call a private REST API too (stage `internal`, `deploy/cloud/internal`): that is NOT the edge, so its
 *   events keep the id the caller sent (the trace of a call between services) and only the prefix logic applies, which never matches.
 *
 * It returns a new event; the one it receives is not changed.
 */
export function fromEdge<T extends HttpApiEvent | RestApiEvent>(event: T, prefix: string | undefined): T {
  const rest = isRestEvent(event);
  const path = rest ? (event as RestApiEvent).path : (event as HttpApiEvent).rawPath;
  const base = prefix ? `${API_PREFIX}/${prefix}/` : undefined;
  const internal = rest && event.requestContext?.stage === INTERNAL_API_STAGE;
  const strip = !internal && path !== undefined && base !== undefined && path.startsWith(base);
  const viaEdge = !internal && (rest || event.requestContext?.authorizer !== undefined);
  const requestId = event.requestContext?.requestId;
  const stamp = viaEdge && requestId ? requestId : undefined;
  if (!strip && stamp === undefined) {
    return event;
  }

  const rewritten = strip ? `${API_PREFIX}/${path.slice(base.length)}` : path;
  const headers = (original: Record<string, string | undefined> | null | undefined) => (stamp ? { ...original, [REQUEST_ID_HEADER]: stamp } : original);

  if (rest) {
    const source = event as RestApiEvent;
    return {
      ...source,
      path: rewritten,
      headers: headers(source.headers),
      // A REST API event carries the headers twice (one value and a list per name): the function reads either
      multiValueHeaders: stamp && source.multiValueHeaders ? { ...source.multiValueHeaders, [REQUEST_ID_HEADER]: [stamp] } : source.multiValueHeaders,
    } as T;
  }

  const source = event as HttpApiEvent;
  return {
    ...source,
    rawPath: rewritten,
    headers: headers(source.headers),
    requestContext: source.requestContext ? { ...source.requestContext, http: source.requestContext.http ? { ...source.requestContext.http, path: rewritten } : undefined } : undefined,
  } as T;
}
