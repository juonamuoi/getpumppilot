/**
 * Per-request correlation id.
 *
 * A single id is generated (or accepted from an inbound `x-request-id`
 * header) for every server request — SSR renders, server routes and server
 * function RPCs alike — and stored in an AsyncLocalStorage scope so any
 * server-only code can read it without threading a parameter through every
 * call. It is echoed back on the response and stamped onto storage-audit rows
 * and threat-report output so one access attempt can be traced end-to-end.
 */
import { AsyncLocalStorage } from "node:async_hooks";

export type RequestScope = { requestId: string };

const storage = new AsyncLocalStorage<RequestScope>();

/** Short, URL-safe, log-friendly id. */
export function newRequestId(): string {
  const rand = crypto.randomUUID().replace(/-/g, "").slice(0, 12);
  return `req_${Date.now().toString(36)}${rand}`;
}

/** Only accept caller-supplied ids that are safe to log and store. */
export function sanitizeRequestId(value: string | null | undefined): string | null {
  const v = (value ?? "").trim();
  return /^[A-Za-z0-9_-]{6,64}$/.test(v) ? v : null;
}

export function runWithRequestId<T>(requestId: string, fn: () => T): T {
  return storage.run({ requestId }, fn);
}

/** Current request id, or null outside a request scope. */
export function getRequestId(): string | null {
  return storage.getStore()?.requestId ?? null;
}

/**
 * Combines a domain correlation id (e.g. a wallet scan id) with the current
 * request id so a stored row points at both. Truncated to the column width.
 */
export function traceId(correlationId?: string | null): string | null {
  const req = getRequestId();
  const own = (correlationId ?? "").trim();
  if (own && req && own !== req) return `${own}#${req}`.slice(0, 64);
  return (own || req || "").slice(0, 64) || null;
}
