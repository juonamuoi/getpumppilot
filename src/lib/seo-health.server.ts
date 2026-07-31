/**
 * Server-only "SEO health at a glance" reader.
 *
 * Unlike the snapshot/alert pipeline in seo-monitor.server.ts, nothing here is
 * persisted: it reads the CURRENT state of the deployed site (sitemap.xml,
 * robots.txt) plus what Search Console currently knows (submitted sitemaps and
 * per-URL last crawl / indexing timestamps) so the admin page can show live
 * status next to the recorded history.
 */

import { resolveSiteUrl } from "@/lib/seo-monitor.server";

const GATEWAY = "https://connector-gateway.lovable.dev/google_search_console";

export type SitemapFileStatus = {
  url: string;
  ok: boolean;
  httpStatus: number | null;
  contentType: string | null;
  urlCount: number;
  lastmodCount: number;
  newestLastmod: string | null;
  fetchedAt: string;
  error: string | null;
};

export type RobotsStatus = {
  url: string;
  ok: boolean;
  httpStatus: number | null;
  blocksEverything: boolean;
  sitemapDirectives: string[];
  sitemapMatchesSitemapUrl: boolean;
  disallowCount: number;
  allowCount: number;
  userAgents: string[];
  raw: string | null;
  fetchedAt: string;
  error: string | null;
};

export type SubmittedSitemap = {
  path: string;
  lastSubmitted: string | null;
  lastDownloaded: string | null;
  errors: number;
  warnings: number;
  submitted: number;
  indexed: number;
  isPending: boolean;
};

export type IndexedUrlStatus = {
  url: string;
  verdict: string | null;
  coverageState: string | null;
  lastCrawlTime: string | null;
  googleCanonical: string | null;
  userCanonical: string | null;
  indexed: boolean;
  error: string | null;
};

export type SeoHealthReport = {
  origin: string;
  siteUrl: string | null;
  generatedAt: string;
  sitemap: SitemapFileStatus;
  robots: RobotsStatus;
  submittedSitemaps: SubmittedSitemap[];
  indexedUrls: IndexedUrlStatus[];
  searchConsoleError: string | null;
};

function gatewayHeaders() {
  const lovableApiKey = process.env.LOVABLE_API_KEY;
  const connectionApiKey = process.env.GOOGLE_SEARCH_CONSOLE_API_KEY;
  if (!lovableApiKey || !connectionApiKey) {
    throw new Error(
      "Search Console is not connected for this project — link the connector to see indexing timestamps.",
    );
  }
  return {
    Authorization: `Bearer ${lovableApiKey}`,
    "X-Connection-Api-Key": connectionApiKey,
  };
}

/** Live fetch + shallow parse of the deployed sitemap.xml. */
export async function checkSitemapFile(origin: string): Promise<SitemapFileStatus> {
  const url = `${origin.replace(/\/$/, "")}/sitemap.xml`;
  const fetchedAt = new Date().toISOString();
  try {
    const res = await fetch(url, { headers: { Accept: "application/xml" } });
    const text = res.ok ? await res.text() : "";
    const locs = [...text.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1]);
    const lastmods = [...text.matchAll(/<lastmod>\s*([^<\s]+)\s*<\/lastmod>/g)].map((m) => m[1]);
    const newest = lastmods
      .map((d) => Date.parse(d))
      .filter((n) => Number.isFinite(n))
      .sort((a, b) => b - a)[0];
    const parseable = /<(urlset|sitemapindex)\b/.test(text);
    return {
      url,
      ok: res.ok && parseable && locs.length > 0,
      httpStatus: res.status,
      contentType: res.headers.get("content-type"),
      urlCount: locs.length,
      lastmodCount: lastmods.length,
      newestLastmod: newest ? new Date(newest).toISOString() : null,
      fetchedAt,
      error: !res.ok
        ? `HTTP ${res.status}`
        : !parseable
          ? "Response is not a <urlset> or <sitemapindex> document"
          : locs.length === 0
            ? "Sitemap contains no <loc> entries"
            : null,
    };
  } catch (e) {
    return {
      url,
      ok: false,
      httpStatus: null,
      contentType: null,
      urlCount: 0,
      lastmodCount: 0,
      newestLastmod: null,
      fetchedAt,
      error: e instanceof Error ? e.message : "Fetch failed",
    };
  }
}

/** Live fetch + parse of the deployed robots.txt. */
export async function checkRobotsFile(origin: string): Promise<RobotsStatus> {
  const base = origin.replace(/\/$/, "");
  const url = `${base}/robots.txt`;
  const fetchedAt = new Date().toISOString();
  try {
    const res = await fetch(url);
    const raw = res.ok ? await res.text() : null;
    const lines = (raw ?? "").split(/\r?\n/).map((l) => l.split("#")[0].trim()).filter(Boolean);
    const directive = (name: string) =>
      lines
        .filter((l) => l.toLowerCase().startsWith(`${name}:`))
        .map((l) => l.slice(name.length + 1).trim());

    const userAgents = directive("user-agent");
    const disallows = directive("disallow");
    const allows = directive("allow");
    const sitemaps = directive("sitemap");
    const blocksEverything =
      userAgents.some((u) => u === "*") && disallows.includes("/") && !allows.includes("/");

    return {
      url,
      ok: res.ok && lines.length > 0 && !blocksEverything,
      httpStatus: res.status,
      blocksEverything,
      sitemapDirectives: sitemaps,
      sitemapMatchesSitemapUrl: sitemaps.some(
        (s) => s.replace(/\/$/, "") === `${base}/sitemap.xml`,
      ),
      disallowCount: disallows.length,
      allowCount: allows.length,
      userAgents,
      raw,
      fetchedAt,
      error: !res.ok
        ? `HTTP ${res.status}`
        : lines.length === 0
          ? "robots.txt is empty"
          : blocksEverything
            ? "robots.txt blocks all crawlers (Disallow: / for User-agent: *)"
            : null,
    };
  } catch (e) {
    return {
      url,
      ok: false,
      httpStatus: null,
      blocksEverything: false,
      sitemapDirectives: [],
      sitemapMatchesSitemapUrl: false,
      disallowCount: 0,
      allowCount: 0,
      userAgents: [],
      raw: null,
      fetchedAt,
      error: e instanceof Error ? e.message : "Fetch failed",
    };
  }
}

async function listSubmittedSitemaps(siteUrl: string): Promise<SubmittedSitemap[]> {
  const res = await fetch(
    `${GATEWAY}/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/sitemaps`,
    { headers: gatewayHeaders() },
  );
  if (!res.ok) throw new Error(`Sitemaps list failed [${res.status}]: ${await res.text()}`);
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
      contents.reduce((acc, c) => acc + Number(c[key] ?? 0), 0);
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

async function inspectIndexedUrl(siteUrl: string, url: string): Promise<IndexedUrlStatus> {
  try {
    const res = await fetch(`${GATEWAY}/v1/urlInspection/index:inspect`, {
      method: "POST",
      headers: { ...gatewayHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ inspectionUrl: url, siteUrl }),
    });
    if (!res.ok) {
      return {
        url,
        verdict: null,
        coverageState: null,
        lastCrawlTime: null,
        googleCanonical: null,
        userCanonical: null,
        indexed: false,
        error: `Inspection failed [${res.status}]`,
      };
    }
    const body = (await res.json()) as {
      inspectionResult?: {
        indexStatusResult?: {
          verdict?: string;
          coverageState?: string;
          lastCrawlTime?: string;
          googleCanonical?: string;
          userCanonical?: string;
        };
      };
    };
    const r = body.inspectionResult?.indexStatusResult ?? {};
    return {
      url,
      verdict: r.verdict ?? null,
      coverageState: r.coverageState ?? null,
      lastCrawlTime: r.lastCrawlTime ?? null,
      googleCanonical: r.googleCanonical ?? null,
      userCanonical: r.userCanonical ?? null,
      indexed: (r.coverageState ?? "").toLowerCase().includes("submitted and indexed"),
      error: null,
    };
  } catch (e) {
    return {
      url,
      verdict: null,
      coverageState: null,
      lastCrawlTime: null,
      googleCanonical: null,
      userCanonical: null,
      indexed: false,
      error: e instanceof Error ? e.message : "Inspection failed",
    };
  }
}

/** Build the full live health report for the admin monitoring page. */
export async function buildSeoHealthReport(opts: {
  origin: string;
  maxInspections?: number;
}): Promise<SeoHealthReport> {
  const origin = opts.origin.replace(/\/$/, "");
  const maxInspections = Math.min(Math.max(opts.maxInspections ?? 10, 0), 25);

  const [sitemap, robots] = await Promise.all([
    checkSitemapFile(origin),
    checkRobotsFile(origin),
  ]);

  let siteUrl: string | null = null;
  let submittedSitemaps: SubmittedSitemap[] = [];
  let indexedUrls: IndexedUrlStatus[] = [];
  let searchConsoleError: string | null = null;

  try {
    siteUrl = await resolveSiteUrl(`${origin}/`);
    submittedSitemaps = await listSubmittedSitemaps(siteUrl);

    if (maxInspections > 0) {
      const res = await fetch(sitemap.url, { headers: { Accept: "application/xml" } });
      const text = res.ok ? await res.text() : "";
      const locs = [...text.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)]
        .map((m) => m[1])
        .filter((u) => u.startsWith(origin));
      const priority = ["/", "/pricing", "/learn", "/scanner", "/blog"];
      const ranked = [...new Set(locs)].sort((a, b) => {
        const rank = (u: string) => {
          const p = u.slice(origin.length) || "/";
          const i = priority.indexOf(p);
          return i === -1 ? priority.length + p.length : i;
        };
        return rank(a) - rank(b);
      });
      const targets = ranked.slice(0, maxInspections);
      const results: IndexedUrlStatus[] = [];
      for (const url of targets) {
        results.push(await inspectIndexedUrl(siteUrl, url));
      }
      indexedUrls = results;
    }
  } catch (e) {
    searchConsoleError = e instanceof Error ? e.message : "Search Console request failed";
  }

  return {
    origin,
    siteUrl,
    generatedAt: new Date().toISOString(),
    sitemap,
    robots,
    submittedSitemaps,
    indexedUrls,
    searchConsoleError,
  };
}
