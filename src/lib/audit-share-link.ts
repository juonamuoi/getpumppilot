import type { AuditFilterState } from "@/lib/audit-filters";

/**
 * Shareable deep-link state for the mitigation audit trail: the active filters
 * plus which entries are expanded, encoded into a single `af` search param so a
 * copied URL reopens the exact same view.
 */
export type AuditShareState = {
  filters: AuditFilterState;
  /** IDs of entries whose outcome breakdown is expanded. */
  expanded: string[];
};

export const AUDIT_SHARE_PARAM = "af";

/** URL-safe base64 (no padding) so the param stays copy/paste friendly. */
function toBase64Url(s: string): string {
  const b64 = typeof btoa === "function" ? btoa(s) : Buffer.from(s, "binary").toString("base64");
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(s: string): string {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  return typeof atob === "function"
    ? atob(padded)
    : Buffer.from(padded, "base64").toString("binary");
}

/** Encodes share state into the compact `af` param value. */
export function encodeAuditShareState(state: AuditShareState): string {
  const f = state.filters;
  const compact = {
    q: f.q || undefined,
    o: f.outcome !== "all" ? f.outcome : undefined,
    r: f.range !== "all" ? f.range : undefined,
    c: f.correlationIds?.length ? f.correlationIds : undefined,
    t: f.tokens?.length ? f.tokens : undefined,
    w: f.wallets?.length ? f.wallets : undefined,
    a: f.alertTypes?.length ? f.alertTypes : undefined,
    e: state.expanded.length ? state.expanded : undefined,
  };
  // encodeURIComponent first so non-ASCII survives btoa's latin1 range.
  return toBase64Url(encodeURIComponent(JSON.stringify(compact)));
}

/** Decodes an `af` param value; returns null when absent or malformed. */
export function decodeAuditShareState(raw: string | undefined | null): AuditShareState | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(decodeURIComponent(fromBase64Url(raw))) as Record<string, unknown>;
    const arr = (v: unknown): string[] =>
      Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
    return {
      filters: {
        q: typeof parsed.q === "string" ? parsed.q : "",
        outcome: (typeof parsed.o === "string" ? parsed.o : "all") as AuditFilterState["outcome"],
        range: (typeof parsed.r === "string" ? parsed.r : "all") as AuditFilterState["range"],
        correlationIds: arr(parsed.c),
        tokens: arr(parsed.t),
        wallets: arr(parsed.w),
        alertTypes: arr(parsed.a),
      },
      expanded: arr(parsed.e),
    };
  } catch {
    return null;
  }
}

/** Builds the absolute shareable URL for the audit trail view. */
export function buildAuditShareUrl(state: AuditShareState, origin?: string): string {
  const base =
    origin ?? (typeof window !== "undefined" ? window.location.origin : "https://www.getpumppilot.app");
  const params = new URLSearchParams({ tab: "replay", [AUDIT_SHARE_PARAM]: encodeAuditShareState(state) });
  return `${base}/alerts?${params.toString()}`;
}
