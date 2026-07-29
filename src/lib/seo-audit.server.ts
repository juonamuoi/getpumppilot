/**
 * Server-only self-audit of the published site's crawl surface.
 *
 * Unlike the Search Console check, this runs entirely against our own origin:
 * it re-fetches /sitemap.xml, then fetches every advertised URL and verifies
 *
 *   - the page responds 200 without a redirect,
 *   - <link rel="canonical"> is present, absolute and self-referencing,
 *   - og:url is present and agrees with the canonical.
 *
 * The result is stored in the same snapshot/alert tables as the Search Console
 * monitor (source "self-audit"), so history, alerts and the admin dashboard all
 * keep working unchanged.
 */

export type AuditIssueCode =
  | "http_error"
  | "redirected"
  | "canonical_missing"
  | "canonical_not_absolute"
  | "canonical_mismatch"
  | "og_url_missing"
  | "og_url_mismatch";

export type AuditIssue = {
  url: string;
  code: AuditIssueCode;
  declaredCanonical: string | null;
  ogUrl: string | null;
  status: number | null;
  message: string;
};

export type AuditSnapshot = {
  source: string;
  site_url: string;
  sitemap_errors: number;
  sitemap_warnings: number;
  submitted_urls: number;
  indexed_urls: number;
  canonical_mismatches: number;
  urls_checked: number;
  crawl_errors: number;
  ok: boolean;
  error: string | null;
  details: { auditIssues: AuditIssue[]; sampledUrls: string[]; sitemaps: never[]; canonicalIssues: never[] };
};

export type AuditAlert = {
  metric: string;
  previous_value: number | null;
  current_value: number | null;
  delta: number | null;
  severity: "info" | "warning" | "critical";
  message: string;
};

const norm = (u: string) => u.replace(/\/+$/, "").toLowerCase();

function meta(html: string, attr: "property" | "name", key: string): string | null {
  const re = new RegExp(
    `<meta[^>]+${attr}=["']${key}["'][^>]*content=["']([^"']*)["']|<meta[^>]+content=["']([^"']*)["'][^>]*${attr}=["']${key}["']`,
    "i",
  );
  const m = html.match(re);
  return (m?.[1] ?? m?.[2] ?? null) || null;
}

function canonicalOf(html: string): string | null {
  const m =
    html.match(/<link[^>]+rel=["']canonical["'][^>]*href=["']([^"']+)["']/i) ??
    html.match(/<link[^>]+href=["']([^"']+)["'][^>]*rel=["']canonical["']/i);
  return m?.[1] ?? null;
}

/** Fetch one URL and run the canonical / og:url / redirect checks. */
export async function auditUrl(url: string): Promise<AuditIssue[]> {
  const issues: AuditIssue[] = [];
  let res: Response;
  try {
    res = await fetch(url, { redirect: "follow", headers: { "user-agent": "PumpPilotSeoAudit/1.0" } });
  } catch (e) {
    return [
      {
        url,
        code: "http_error",
        declaredCanonical: null,
        ogUrl: null,
        status: null,
        message: `Fetch failed: ${e instanceof Error ? e.message : String(e)}`,
      },
    ];
  }

  const base = { url, declaredCanonical: null as string | null, ogUrl: null as string | null, status: res.status };

  if (!res.ok) {
    return [{ ...base, code: "http_error", message: `Returned HTTP ${res.status}.` }];
  }
  if (norm(res.url) !== norm(url)) {
    issues.push({ ...base, code: "redirected", message: `Redirects to ${res.url}.` });
  }

  const html = await res.text();
  const canonical = canonicalOf(html);
  const ogUrl = meta(html, "property", "og:url");
  const ctx = { ...base, declaredCanonical: canonical, ogUrl };

  if (!canonical) {
    issues.push({ ...ctx, code: "canonical_missing", message: "No <link rel=\"canonical\"> found." });
  } else if (!/^https?:\/\//i.test(canonical)) {
    issues.push({ ...ctx, code: "canonical_not_absolute", message: `Canonical "${canonical}" is not absolute.` });
  } else if (norm(canonical) !== norm(url)) {
    issues.push({ ...ctx, code: "canonical_mismatch", message: `Canonical points at ${canonical}, not ${url}.` });
  }

  if (!ogUrl) {
    issues.push({ ...ctx, code: "og_url_missing", message: "No og:url meta tag." });
  } else if (canonical && norm(ogUrl) !== norm(canonical)) {
    issues.push({ ...ctx, code: "og_url_mismatch", message: `og:url ${ogUrl} disagrees with canonical ${canonical}.` });
  }

  return issues;
}

const CRITICAL: AuditIssueCode[] = ["http_error", "canonical_missing", "canonical_mismatch"];

/** Fetch the sitemap and audit every URL it advertises. Never throws. */
export async function collectAuditSnapshot(opts: {
  origin: string;
  source: string;
  maxUrls?: number;
}): Promise<AuditSnapshot> {
  const origin = opts.origin.replace(/\/$/, "");
  const snapshot: AuditSnapshot = {
    source: opts.source,
    site_url: origin,
    sitemap_errors: 0,
    sitemap_warnings: 0,
    submitted_urls: 0,
    indexed_urls: 0,
    canonical_mismatches: 0,
    urls_checked: 0,
    crawl_errors: 0,
    ok: true,
    error: null,
    details: { auditIssues: [], sampledUrls: [], sitemaps: [], canonicalIssues: [] },
  };

  try {
    const res = await fetch(`${origin}/sitemap.xml`);
    if (!res.ok) throw new Error(`sitemap.xml returned HTTP ${res.status}`);
    const xml = await res.text();
    const urls = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)]
      .map((m) => m[1]!)
      .slice(0, Math.max(1, opts.maxUrls ?? 40));

    snapshot.submitted_urls = urls.length;
    snapshot.details.sampledUrls = urls;

    const issues: AuditIssue[] = [];
    // Small batches keep the worker well inside its request budget.
    for (let i = 0; i < urls.length; i += 5) {
      const batch = await Promise.all(urls.slice(i, i + 5).map(auditUrl));
      for (const list of batch) issues.push(...list);
    }

    snapshot.urls_checked = urls.length;
    snapshot.details.auditIssues = issues;
    snapshot.canonical_mismatches = issues.filter(
      (i) => i.code === "canonical_mismatch" || i.code === "canonical_missing",
    ).length;
    snapshot.crawl_errors = issues.filter((i) => i.code === "http_error" || i.code === "redirected").length;
    snapshot.sitemap_errors = issues.filter((i) => CRITICAL.includes(i.code)).length;
    snapshot.sitemap_warnings = issues.length - snapshot.sitemap_errors;
    snapshot.indexed_urls = urls.length - new Set(issues.map((i) => i.url)).size;
  } catch (e) {
    snapshot.ok = false;
    snapshot.error = e instanceof Error ? e.message : String(e);
  }

  return snapshot;
}

/** New failures only: issues present now that were not in the previous run. */
export function diffAudits(previous: AuditSnapshot | null, current: AuditSnapshot): AuditAlert[] {
  if (!current.ok) {
    return [
      {
        metric: "audit_failed",
        previous_value: null,
        current_value: null,
        delta: null,
        severity: "warning",
        message: `Scheduled SEO audit could not complete: ${current.error ?? "unknown error"}`,
      },
    ];
  }

  const now = current.details.auditIssues;
  if (!previous || !previous.ok) {
    return [
      {
        metric: "audit_baseline",
        previous_value: null,
        current_value: now.length,
        delta: null,
        severity: now.length ? "warning" : "info",
        message: `Baseline audit: ${now.length} issue${now.length === 1 ? "" : "s"} across ${current.urls_checked} sitemap URLs.`,
      },
    ];
  }

  const key = (i: AuditIssue) => `${i.url}::${i.code}`;
  const before = new Set((previous.details.auditIssues ?? []).map(key));
  const fresh = now.filter((i) => !before.has(key(i)));
  const resolved = (previous.details.auditIssues ?? []).filter(
    (i) => !now.some((n) => key(n) === key(i)),
  );

  const alerts: AuditAlert[] = fresh.slice(0, 25).map((i) => ({
    metric: `audit:${i.code}`,
    previous_value: null,
    current_value: null,
    delta: null,
    severity: CRITICAL.includes(i.code) ? "critical" : "warning",
    message: `${i.url} — ${i.message}`,
  }));

  if (resolved.length) {
    alerts.push({
      metric: "audit_resolved",
      previous_value: (previous.details.auditIssues ?? []).length,
      current_value: now.length,
      delta: now.length - (previous.details.auditIssues ?? []).length,
      severity: "info",
      message: `${resolved.length} previously failing check${resolved.length === 1 ? "" : "s"} now pass.`,
    });
  }

  return alerts;
}

/** Run the audit, store the snapshot, and record one alert per new failure. */
export async function runSeoAudit(opts: {
  origin: string;
  source?: string;
  maxUrls?: number;
}): Promise<{ snapshotId: string | null; snapshot: AuditSnapshot; alerts: AuditAlert[] }> {
  const source = opts.source ?? "self-audit";
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: prevRow } = await supabaseAdmin
    .from("seo_crawl_snapshots")
    .select("*")
    .like("source", "self-audit%")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const snapshot = await collectAuditSnapshot({ ...opts, source });
  const alerts = diffAudits((prevRow as unknown as AuditSnapshot | null) ?? null, snapshot);

  const { data: inserted, error } = await supabaseAdmin
    .from("seo_crawl_snapshots")
    .insert(snapshot as never)
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  const snapshotId = (inserted as { id: string } | null)?.id ?? null;

  if (snapshotId && alerts.length) {
    const { error: alertError } = await supabaseAdmin.from("seo_crawl_alerts").insert(
      alerts.map((a) => ({ ...a, snapshot_id: snapshotId, site_url: snapshot.site_url })) as never,
    );
    if (alertError) console.error("[seo-audit] alert insert failed", alertError.message);
  }

  return { snapshotId, snapshot, alerts };
}
