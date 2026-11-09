import { randomBytes, randomUUID } from 'crypto';
import { ExecutionContext } from '../context/execution-context.service';

/**
 * Tracing headers that travel with a request through the platform. The API gateway generates `X-Request-Id` and continues a
 * W3C `traceparent`; a service reads them, writes them in its logs and sends them on in the calls it makes to other services.
 */
export const REQUEST_ID_HEADER = 'x-request-id';
export const TRACEPARENT_HEADER = 'traceparent';

/** What the gateway generates (a UUID) and what a caller may reasonably send: short, printable, no spaces or control characters */
const REQUEST_ID_FORMAT = /^[A-Za-z0-9._:-]{8,128}$/;
/** `00-<32 hex trace id>-<16 hex parent id>-<2 hex flags>`; all zeros are not valid ids (W3C Trace Context, level 1) */
const TRACEPARENT_FORMAT = /^00-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/;

const single = (value: string | string[] | undefined): string | undefined => (Array.isArray(value) ? value[0] : value);

/** The request id a caller sent, or `undefined` when it is missing or not in a safe shape (it ends up in logs) */
export function readRequestId(headers: Record<string, string | string[] | undefined> | undefined): string | undefined {
  const value = single(headers?.[REQUEST_ID_HEADER]);
  return value && REQUEST_ID_FORMAT.test(value) ? value : undefined;
}

/** The `traceparent` a caller sent, or `undefined` when it is missing, malformed or made of zeros */
export function readTraceparent(headers: Record<string, string | string[] | undefined> | undefined): string | undefined {
  const value = single(headers?.[TRACEPARENT_HEADER])?.trim().toLowerCase();
  const parts = value ? TRACEPARENT_FORMAT.exec(value) : null;
  if (!parts || /^0+$/.test(parts[1]) || /^0+$/.test(parts[2])) {
    return undefined;
  }
  return value;
}

/** The same trace with a new span id: what a service sends to the next one, so the call has its own place in the trace */
export function nextTraceparent(traceparent: string): string {
  const [version, traceId, , flags] = traceparent.split('-');
  return `${version}-${traceId}-${randomBytes(8).toString('hex')}-${flags}`;
}

/**
 * The headers to send in a call to another service from the request being handled: its request id (or a new one when the
 * call does not come from a request, such as a job) and its trace. Empty fields are left out.
 */
export function outgoingTraceHeaders(): Record<string, string> {
  const headers: Record<string, string> = { [REQUEST_ID_HEADER]: ExecutionContext.getRequestId() ?? randomUUID() };
  const traceparent = ExecutionContext.get<string>('traceparent');
  if (traceparent) {
    headers[TRACEPARENT_HEADER] = nextTraceparent(traceparent);
  }
  return headers;
}
