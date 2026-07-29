/**
 * Server-only SEO crawl monitoring.
 *
 * Each run asks Google Search Console for the current state of the submitted
 * sitemaps and inspects a sample of canonical URLs, stores the result as a
 * snapshot row, then diffs it against the previous snapshot so any change in
 * sitemap errors, indexing coverage or Google's canonical selection raises an
 * alert. Snapshots are append-only history; alerts are the "what changed" feed.
 */

const GATEWAY = "https://connector-gateway.lovable.dev/google_search_console";

export type CanonicalIssue = {
  url: string;
  declaredCanonical: string | null;
  googleCanonical: string | null;
  coverageState: string | null;
  verdict: string | null;
  issue: "canonical_mismatch" | "not_indexed" | "fetch_error";
};

export type SitemapStatus = {
  path: string;
  lastSubmitted: string | null;
  lastDownloaded: string | null;
  errors: number;
  warnings: number;
  submitted: number;
  indexed: number;
  isPending: boolean;
};

export type CrawlSnapshot = {
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
  details: {
    sitemaps: SitemapStatus[];
    canonicalIssues: CanonicalIssue[];
    sampledUrls: string[];
  };
};

export type CrawlAlert = {
  metric: string;
  previous_value: number | null;
  current_value: number | null;
  delta: number | null;
  severity: "info" | "warning" | "critical";
  message: string;
};

function headers() {
  const lovableApiKey = process.env.LOVABLE_API_KEY;
  const connectionApiKey = process.env.GOOGLE_SEARCH_CONSOLE_API_KEY;
  if (!lovableApiKey || !connectionApiKey) {
    throw new Error(
      "Search Console is not connected for this project — link the connector to enable crawl monitoring.",
    );
  }
  return {
    Authorization: `Bearer ${lovableApiKey}`,
    "X-Connection-Api-Key": connectionApiKey,
  };
}

type SiteEntry = { siteUrl: string; permissionLevel?: string };

function coversTarget(siteUrl: string, target: URL) {
  if (siteUrl.startsWith("sc-domain:")) {
    const domain = siteUrl.slice("sc-domain:".length).toLowerCase();
    const host = target.hostname.toLowerCase();
    return host === domain || host.endsWith(`.${domain}`);
  }
  try {
    const prefix = new URL(siteUrl);
    return target.href.startsWith(prefix.href);
  } catch {
    return false;
  }
}

/** Resolve the verified Search Console property that covers `targetUrl`. */
export async function resolveSiteUrl(
  targetUrl: string,
  selectedSiteUrl?: string,
): Promise<string> {
  const response = await fetch(`${GATEWAY}/webmasters/v3/sites`, { headers: headers() });
  if (!response.ok) {
    throw new Error(
      `Could not list Search Console properties [${response.status}]: ${await response.text()}`,
    );
  }
  const { siteEntry = [] } = (await response.json()) as { siteEntry?: SiteEntry[] };
  const target = new URL(targetUrl);
  const matches = siteEntry.filter(
    (entry) =>
      entry.permissionLevel !== "siteUnverifiedUser" && coversTarget(entry.siteUrl, target),
  );
  if (selectedSiteUrl) {
    const selected = matches.find((entry) => entry.siteUrl === selectedSiteUrl);
    if (!selected) {
      throw new Error("The selected Search Console property is not verified for this site");
    }
    return selected.siteUrl;
  }
  if (matches.length === 1) return matches[0]!.siteUrl;
  if (matches.length === 0) throw new Error("No verified Search Console property covers this site");
  throw new Error(
    `Multiple verified properties cover this site; pick one of: ${matches
      .map((m) => m.siteUrl)
      .join(", ")}`,
  );
}

async function listSitemaps(siteUrl: string): Promise<SitemapStatus[]> {
  const res = await fetch(
    `${GATEWAY}/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/sitemaps`,
    { headers: headers() },
  );
  if (res.status === 403) {
    throw new Error("The connected Google account cannot access this Search Console property");
  }
  if (!res.ok) throw new Error(`Sitemap listing failed [${res.status}]: ${await res.text()}`);
  const body = (await res.json()) as {
    sitemap?: Array<{
      path?: string;
      lastSubmitted?: string;
      lastDownloaded?: string;
      errors?: string | number;
      warnings?: string | number;
      isPending?: boolean;
      contents?: Array<{ submitted?: string | number; indexed?: string | number }>;
    }>;
  };
  return (body.sitemap ?? []).map((s) => {
    const contents = s.contents ?? [];
    const sum = (key: "submitted" | "indexed") =>
      contents.reduce((total, c) => total + Number(c[key] ?? 0), 0);
    return {
      path: s.path ?? "",
      lastSubmitted: s.lastSubmitted ?? null,
      lastDownloaded: s.lastDownloaded ?? null,
      errors: Number(s.errors ?? 0),
      warnings: Number(s.warnings ?? 0),
      submitted: sum("submitted"),
      indexed: sum("indexed"),
      isPending: !!s.isPending,
    };
  });
}

async function inspectUrl(siteUrl: string, inspectionUrl: string): Promise<CanonicalIssue | null> {
  const res = await fetch(`${GATEWAY}/v1/urlInspection/index:inspect`, {
    method: "POST",
    headers: { ...headers(), "Content-Type": "application/json" },
    body: JSON.stringify({ inspectionUrl, siteUrl }),
  });
  if (!res.ok) {
    return {
      url: inspectionUrl,
      declaredCanonical: null,
      googleCanonical: null,
      coverageState: null,
      verdict: null,
      issue: "fetch_error",
    };
  }
  const body = (await res.json()) as {
    inspectionResult?: {
      indexStatusResult?: {
        verdict?: string;
        coverageState?: string;
        userCanonical?: string;
        googleCanonical?: string;
      };
    };
  };
  const r = body.inspectionResult?.indexStatusResult ?? {};
  const declared = r.userCanonical ?? null;
  const google = r.googleCanonical ?? null;
  const mismatch = !!declared && !!google && declared !== google;
  const notIndexed = r.verdict === "FAIL" || r.verdict === "NEUTRAL";
  if (!mismatch && !notIndexed) return null;
  return {
    url: inspectionUrl,
    declaredCanonical: declared,
    googleCanonical: google,
    coverageState: r.coverageState ?? null,
    verdict: r.verdict ?? null,
    issue: mismatch ? "canonical_mismatch" : "not_indexed",
  };
}

/** URLs from the published sitemap, used as the canonical-inspection sample. */
export async function sitemapUrls(origin: string): Promise<string[]> {
  const res = await fetch(`${origin.replace(/\/$/, "")}/sitemap.xml`);
  if (!res.ok) return [];
  const xml = await res.text();
  return [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1]!);
}

export type RunOptions = {
  origin: string;
  source: string;
  /** How many sitemap URLs to inspect for canonical selection (quota-bound). */
  sampleSize?: number;
  siteUrl?: string;
};

/** Collect one snapshot of crawl health. Never throws — failures are recorded. */
export async function collectSnapshot(opts: RunOptions): Promise<CrawlSnapshot> {
  const base: CrawlSnapshot = {
    source: opts.source,
    site_url: opts.origin,
    sitemap_errors: 0,
    sitemap_warnings: 0,
    submitted_urls: 0,
    indexed_urls: 0,
    canonical_mismatches: 0,
    urls_checked: 0,
    crawl_errors: 0,
    ok: true,
    error: null,
    details: { sitemaps: [], canonicalIssues: [], sampledUrls: [] },
  };

  try {
    const siteUrl = await resolveSiteUrl(opts.origin, opts.siteUrl);
    base.site_url = siteUrl;
    const sitemaps = await listSitemaps(siteUrl);
    base.details.sitemaps = sitemaps;
    base.sitemap_errors = sitemaps.reduce((s, m) => s + m.errors, 0);
    base.sitemap_warnings = sitemaps.reduce((s, m) => s + m.warnings, 0);
    base.submitted_urls = sitemaps.reduce((s, m) => s + m.submitted, 0);
    base.indexed_urls = sitemaps.reduce((s, m) => s + m.indexed, 0);

    const sample = (await sitemapUrls(opts.origin)).slice(0, Math.max(1, opts.sampleSize ?? 8));
    base.details.sampledUrls = sample;
    const issues: CanonicalIssue[] = [];
    for (const url of sample) {
      const issue = await inspectUrl(siteUrl, url);
      if (issue) issues.push(issue);
    }
    base.urls_checked = sample.length;
    base.details.canonicalIssues = issues;
    base.canonical_mismatches = issues.filter((i) => i.issue === "canonical_mismatch").length;
    base.crawl_errors = issues.filter((i) => i.issue !== "canonical_mismatch").length;
  } catch (e) {
    base.ok = false;
    base.error = e instanceof Error ? e.message : String(e);
  }
  return base;
}

type MetricKey =
  | "sitemap_errors"
  | "sitemap_warnings"
  | "canonical_mismatches"
  | "crawl_errors"
  | "indexed_urls"
  | "submitted_urls";

const METRIC_LABEL: Record<MetricKey, string> = {
  sitemap_errors: "Sitemap errors",
  sitemap_warnings: "Sitemap warnings",
  canonical_mismatches: "Canonical selection mismatches",
  crawl_errors: "URLs not indexed / fetch errors",
  indexed_urls: "Indexed URLs",
  submitted_urls: "Submitted URLs",
};

/** Metrics where an increase is bad (the rest are coverage counts). */
const BAD_WHEN_UP: MetricKey[] = [
  "sitemap_errors",
  "sitemap_warnings",
  "canonical_mismatches",
  "crawl_errors",
];

/** Compare two snapshots and produce one alert per metric that moved. */
export function diffSnapshots(
  previous: CrawlSnapshot | null,
  current: CrawlSnapshot,
): CrawlAlert[] {
  const alerts: CrawlAlert[] = [];

  if (!current.ok) {
    alerts.push({
      metric: "check_failed",
      previous_value: null,
      current_value: null,
      delta: null,
      severity: "warning",
      message: `Crawl check could not complete: ${current.error ?? "unknown error"}`,
    });
    return alerts;
  }

  if (!previous) {
    alerts.push({
      metric: "baseline",
      previous_value: null,
      current_value: current.sitemap_errors + current.canonical_mismatches,
      delta: null,
      severity: "info",
      message: `Baseline recorded: ${current.sitemap_errors} sitemap errors, ${current.canonical_mismatches} canonical mismatches across ${current.urls_checked} inspected URLs.`,
    });
    return alerts;
  }

  const keys = Object.keys(METRIC_LABEL) as MetricKey[];
  for (const key of keys) {
    const before = Number(previous[key] ?? 0);
    const after = Number(current[key] ?? 0);
    if (before === after) continue;
    const delta = after - before;
    const worse = BAD_WHEN_UP.includes(key) ? delta > 0 : delta < 0;
    const severity: CrawlAlert["severity"] = !worse
      ? "info"
      : key === "sitemap_errors" || key === "canonical_mismatches"
        ? "critical"
        : "warning";
    alerts.push({
      metric: key,
      previous_value: before,
      current_value: after,
      delta,
      severity,
      message: `${METRIC_LABEL[key]} ${delta > 0 ? "rose" : "fell"} from ${before} to ${after}${
        worse ? " — needs attention" : ""
      }.`,
    });
  }

  const newlyBroken = current.details.canonicalIssues
    .filter((i) => !previous.details.canonicalIssues.some((p) => p.url === i.url))
    .slice(0, 10);
  for (const issue of newlyBroken) {
    alerts.push({
      metric: `url:${issue.issue}`,
      previous_value: null,
      current_value: null,
      delta: null,
      severity: issue.issue === "canonical_mismatch" ? "critical" : "warning",
      message:
        issue.issue === "canonical_mismatch"
          ? `Google now prefers ${issue.googleCanonical} over the declared canonical ${issue.declaredCanonical} for ${issue.url}.`
          : `${issue.url} is not indexed (${issue.coverageState ?? issue.verdict ?? "unknown state"}).`,
    });
  }

  return alerts;
}

type Sender = (
  template: string,
  to: string,
  opts: { templateData?: Record<string, unknown>; idempotencyKey?: string },
) => Promise<{ sent: boolean; reason?: string }>;

const SEND_MODULE = "@/lib/email-templates/send-email";

/**
 * Best-effort email digest of new alerts. The transactional sender only exists
 * once email templates are scaffolded, so this degrades quietly.
 */
export async function sendAlertEmail(
  to: string,
  siteUrl: string,
  alerts: CrawlAlert[],
  snapshotId: string,
): Promise<boolean> {
  if (!to || alerts.length === 0) return false;
  let send: Sender | null = null;
  try {
    const mod = (await import(/* @vite-ignore */ SEND_MODULE)) as unknown as {
      sendTemplateEmail: Sender;
    };
    send = mod.sendTemplateEmail;
  } catch {
    return false;
  }
  try {
    const res = await send("seo-crawl-alert", to, {
      idempotencyKey: `seo-crawl-${snapshotId}`,
      templateData: {
        siteUrl,
        count: alerts.length,
        alerts: alerts.map((a) => ({ severity: a.severity, message: a.message })),
      },
    });
    return res.sent;
  } catch (e) {
    console.error("[seo-monitor] alert email failed", e instanceof Error ? e.message : e);
    return false;
  }
}

/** Run a check, persist the snapshot and any resulting alerts. */
export async function runCrawlCheck(
  opts: RunOptions & { notifyEmail?: string },
): Promise<{ snapshotId: string | null; snapshot: CrawlSnapshot; alerts: CrawlAlert[] }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: prevRow } = await supabaseAdmin
    .from("seo_crawl_snapshots")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const snapshot = await collectSnapshot(opts);
  const previous = (prevRow as unknown as CrawlSnapshot | null) ?? null;
  const alerts = diffSnapshots(previous && previous.ok ? previous : null, snapshot);

  const { data: inserted, error } = await supabaseAdmin
    .from("seo_crawl_snapshots")
    .insert(snapshot as never)
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  const snapshotId = (inserted as { id: string } | null)?.id ?? null;

  if (snapshotId && alerts.length) {
    await supabaseAdmin.from("seo_crawl_alerts").insert(
      alerts.map((a) => ({ ...a, snapshot_id: snapshotId, site_url: snapshot.site_url })) as never,
    );
    const notable = alerts.filter((a) => a.severity !== "info");
    if (notable.length && opts.notifyEmail) {
      await sendAlertEmail(opts.notifyEmail, snapshot.site_url, notable, snapshotId);
    }
  }

  return { snapshotId, snapshot, alerts };
}
