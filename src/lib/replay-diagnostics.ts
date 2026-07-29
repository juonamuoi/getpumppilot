import type { TuningLogEntry } from "./paper-store";
import { CANONICAL_ORIGIN } from "./sitemap-canonical-validate";

/**
 * Why a one-click replay could not run, or did not fully succeed.
 *
 * The replay button used to fail with a single generic toast ("Nothing
 * replayable in this entry"), which hid three very different causes:
 *
 *  - missing-route-data: the audit batch is incomplete — no correlation id,
 *    no rule entries, or entries stripped of the values a replay needs.
 *  - mismatch: the stored entry does not line up with the current app —
 *    an unknown rule key, a non-numeric value, or an operator/unit that
 *    changed since the entry was recorded.
 *  - fetch: an affected asset page did not answer 200 when we verified it.
 *  - state: the entry is review-only (imported) or already reverted.
 *
 * Every issue carries a human-readable reason plus a hint, and the caller
 * decides which ones block a retry.
 */

export type ReplayIssueKind = "missing-route-data" | "mismatch" | "fetch" | "state";
export type ReplayIssueSeverity = "blocker" | "warning";

export type ReplayIssue = {
  code: string;
  kind: ReplayIssueKind;
  severity: ReplayIssueSeverity;
  /** Short reason shown as the row title. */
  reason: string;
  /** Concrete evidence: which field, which value, which URL/status. */
  detail: string;
  /** What to do about it. */
  hint: string;
  /** Whether retrying could plausibly change the outcome. */
  retryable: boolean;
};

export const VALID_RULE_KEYS = ["momentum", "volume", "volatility", "change"] as const;
export type ValidRuleKey = (typeof VALID_RULE_KEYS)[number];

export const RULE_LABELS: Record<ValidRuleKey, string> = {
  momentum: "Momentum",
  volume: "Volume score",
  volatility: "Volatility",
  change: "24h change",
};

export type ReplayPreflight = {
  ok: boolean;
  /** Rule entries that would actually be replayed. */
  batch: TuningLogEntry[];
  /** True when only the preview context exists (no applied entries). */
  previewOnly: boolean;
  issues: ReplayIssue[];
  blockers: ReplayIssue[];
  warnings: ReplayIssue[];
};

const isFiniteNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/**
 * Inspect an audit entry before calling `replayMitigation`, so a failure can be
 * explained field by field instead of as one opaque toast.
 */
export function preflightReplay(
  log: TuningLogEntry[],
  entry: TuningLogEntry,
  opts: { imported?: boolean } = {},
): ReplayPreflight {
  const issues: ReplayIssue[] = [];

  if (opts.imported) {
    issues.push({
      code: "imported",
      kind: "state",
      severity: "blocker",
      reason: "Imported record is review-only",
      detail:
        "This entry came from an uploaded CSV/JSON file, so it has no live rule state to re-apply.",
      hint: "Replay the original entry in this workspace, or apply the rules manually.",
      retryable: false,
    });
  }

  const cid = entry.correlationId;
  if (!cid) {
    issues.push({
      code: "no-correlation-id",
      kind: "missing-route-data",
      severity: "blocker",
      reason: "No correlation ID on this entry",
      detail: `Entry ${entry.id} has no correlationId, so its sibling rule changes cannot be grouped.`,
      hint: "Only mitigations recorded with a correlation ID can be replayed.",
      retryable: false,
    });
  }

  const source = cid
    ? log.filter(
        (e) =>
          e.correlationId === cid &&
          e.source === "mitigation" &&
          e.kind === "rule" &&
          e.rule !== "undo",
      )
    : [];

  const applied = source.filter((e) => e.phase !== "preview");
  const batch = applied.length > 0 ? applied : source;
  const previewOnly = applied.length === 0 && source.length > 0;

  if (cid && source.length === 0) {
    const anySibling = log.some((e) => e.correlationId === cid);
    issues.push({
      code: "no-rule-entries",
      kind: "missing-route-data",
      severity: "blocker",
      reason: "No replayable rule changes in this batch",
      detail: anySibling
        ? `Correlation ${cid} only contains undo/bounds entries — no source:"mitigation", kind:"rule" rows to re-apply.`
        : `No audit rows found for correlation ${cid}. It may have been purged by the retention policy.`,
      hint: anySibling
        ? "Replay the mitigation entry itself rather than its undo record."
        : "Check the retention settings — expired entries are removed from history.",
      retryable: false,
    });
  }

  if (previewOnly) {
    issues.push({
      code: "preview-only",
      kind: "state",
      severity: "warning",
      reason: "Replaying from preview context",
      detail: "This mitigation was only previewed, never applied; the stored preview values are used.",
      hint: "The replay will apply those previewed thresholds for real.",
      retryable: true,
    });
  }

  if (entry.revertedAt) {
    issues.push({
      code: "reverted",
      kind: "state",
      severity: "warning",
      reason: "This mitigation was reverted",
      detail: `Reverted at ${new Date(entry.revertedAt).toLocaleString()}${
        entry.revertReason ? ` — ${entry.revertReason}` : ""
      }.`,
      hint: "Replaying re-applies the thresholds that were rolled back.",
      retryable: true,
    });
  }

  for (const e of batch) {
    if (!(VALID_RULE_KEYS as readonly string[]).includes(e.rule)) {
      issues.push({
        code: `unknown-rule:${e.rule}`,
        kind: "mismatch",
        severity: "blocker",
        reason: `Unknown rule key "${e.rule}"`,
        detail: `Recorded as "${e.ruleLabel || e.rule}", but the scanner only accepts ${VALID_RULE_KEYS.join(", ")}.`,
        hint: "The rule was renamed or removed since this entry was written; re-tune it manually.",
        retryable: false,
      });
      continue;
    }
    if (!isFiniteNumber(e.newValue)) {
      issues.push({
        code: `bad-value:${e.rule}`,
        kind: "mismatch",
        severity: "blocker",
        reason: `Non-numeric threshold for ${e.ruleLabel || e.rule}`,
        detail: `newValue is ${JSON.stringify(e.newValue)} (expected a finite number).`,
        hint: "The record is corrupt — export it for review and re-create the mitigation.",
        retryable: false,
      });
    }
    if (!isFiniteNumber(e.oldValue)) {
      issues.push({
        code: `bad-old-value:${e.rule}`,
        kind: "mismatch",
        severity: "warning",
        reason: `Missing previous value for ${e.ruleLabel || e.rule}`,
        detail: `oldValue is ${JSON.stringify(e.oldValue)} — the replay can apply, but undo will be imprecise.`,
        hint: "You can still revert manually from Scanner rules.",
        retryable: true,
      });
    }
    const expectedLabel = RULE_LABELS[e.rule as ValidRuleKey];
    if (e.ruleLabel && expectedLabel && e.ruleLabel !== expectedLabel) {
      issues.push({
        code: `label-drift:${e.rule}`,
        kind: "mismatch",
        severity: "warning",
        reason: `Label drift on ${e.rule}`,
        detail: `Recorded as "${e.ruleLabel}", now called "${expectedLabel}".`,
        hint: "Cosmetic only — the same threshold is applied.",
        retryable: true,
      });
    }
    if (e.operator && e.operator !== ">=" && e.operator !== "<=") {
      issues.push({
        code: `bad-operator:${e.rule}`,
        kind: "mismatch",
        severity: "blocker",
        reason: `Unsupported operator "${e.operator}"`,
        detail: `Rule ${e.rule} recorded operator "${e.operator}"; only ">=" and "<=" are supported.`,
        hint: "Re-create this mitigation with a supported comparison.",
        retryable: false,
      });
    }
  }

  const blockers = issues.filter((i) => i.severity === "blocker");
  const warnings = issues.filter((i) => i.severity === "warning");
  return { ok: blockers.length === 0 && batch.length > 0, batch, previewOnly, issues, blockers, warnings };
}

export type RouteFetchResult = {
  symbol: string;
  path: string;
  url: string;
  status: number | null;
  ok: boolean;
  redirected: boolean;
  error?: string;
  ms: number;
};

/**
 * Verify that every asset page a replay surfaced actually answers 200.
 *
 * Uses same-origin relative paths so it works in preview and production, and
 * never throws — a network failure becomes a `fetch` issue with the reason
 * attached.
 */
export async function verifyReplayRoutes(
  symbols: string[],
  signal?: AbortSignal,
): Promise<RouteFetchResult[]> {
  const unique = [...new Set(symbols.map((s) => s.trim()).filter(Boolean))].sort();
  return Promise.all(
    unique.map(async (symbol) => {
      const path = `/asset/${symbol.toLowerCase()}`;
      const started = Date.now();
      try {
        const res = await fetch(path, { method: "GET", redirect: "follow", signal });
        return {
          symbol,
          path,
          url: `${CANONICAL_ORIGIN}${path}`,
          status: res.status,
          ok: res.ok,
          redirected: res.redirected,
          ms: Date.now() - started,
        };
      } catch (err) {
        return {
          symbol,
          path,
          url: `${CANONICAL_ORIGIN}${path}`,
          status: null,
          ok: false,
          redirected: false,
          error: err instanceof Error ? err.message : "Network request failed",
          ms: Date.now() - started,
        };
      }
    }),
  );
}

/** Turn non-200 / redirected route fetches into readable issues. */
export function routeIssues(results: RouteFetchResult[]): ReplayIssue[] {
  const issues: ReplayIssue[] = [];
  for (const r of results) {
    if (r.status === null) {
      issues.push({
        code: `fetch-error:${r.symbol}`,
        kind: "fetch",
        severity: "blocker",
        reason: `Could not reach ${r.path}`,
        detail: r.error ?? "The request failed before a response arrived.",
        hint: "Check your connection, then retry — this is usually transient.",
        retryable: true,
      });
    } else if (!r.ok) {
      issues.push({
        code: `fetch-status:${r.symbol}`,
        kind: "fetch",
        severity: "blocker",
        reason: `${r.path} returned HTTP ${r.status}`,
        detail: `Expected 200 for ${r.symbol}; got ${r.status} after ${r.ms}ms.`,
        hint:
          r.status === 404
            ? "The asset page no longer exists — remove the symbol from this mitigation."
            : "Server-side error on the asset page; retry once it recovers.",
        retryable: r.status >= 500 || r.status === 429,
      });
    } else if (r.redirected) {
      issues.push({
        code: `fetch-redirect:${r.symbol}`,
        kind: "fetch",
        severity: "warning",
        reason: `${r.path} redirected before serving`,
        detail: `${r.symbol} answered 200 but only after a redirect, which weakens the canonical signal.`,
        hint: "Point internal links at the final URL.",
        retryable: true,
      });
    }
  }
  return issues;
}

export const KIND_LABEL: Record<ReplayIssueKind, string> = {
  "missing-route-data": "Missing route data",
  mismatch: "Mismatch",
  fetch: "Fetch",
  state: "State",
};

/** One-line summary used in the toast. */
export function summarizeIssues(issues: ReplayIssue[]): string {
  const counts = new Map<ReplayIssueKind, number>();
  for (const i of issues) counts.set(i.kind, (counts.get(i.kind) ?? 0) + 1);
  return [...counts.entries()].map(([k, n]) => `${n} ${KIND_LABEL[k].toLowerCase()}`).join(", ");
}
