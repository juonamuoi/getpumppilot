import { createServerFn } from "@tanstack/react-start";

export interface SeoRouteAudit {
  path: string;
  status: number | null;
  title: string | null;
  canonical: string | null;
  ogUrl: string | null;
  robots: string | null;
  ogTitle: string | null;
  ogDescription: string | null;
  ogImage: string | null;
  twitterCard: string | null;
  twitterSite: string | null;
  /** Canonical + og:url agree with each other */
  selfConsistent: boolean;
  /** Both tags point at the expected production host */
  hostMatches: boolean;
  /** Canonical/og:url resolve to this exact route path */
  pathMatches: boolean;
  /** All five social tags present and well-formed */
  socialComplete: boolean;
  issues: string[];
  error?: string;
}

export interface SeoPreviewResult {
  expectedOrigin: string;
  checkedOrigin: string;
  generatedAt: string;
  routes: SeoRouteAudit[];
}

const EXPECTED_ORIGIN = "https://www.getpumppilot.app";
const VALID_TWITTER_CARDS = ["summary", "summary_large_image", "app", "player"];

function pick(html: string, re: RegExp): string | null {
  const m = html.match(re);
  return m ? m[1].trim() : null;
}

function meta(html: string, key: string, attr: "property" | "name"): string | null {
  const esc = key.replace(/[:]/g, "\\:");
  return (
    pick(
      html,
      new RegExp(`<meta[^>]+${attr}=["']${esc}["'][^>]*content=["']([^"']*)["']`, "i"),
    ) ??
    pick(
      html,
      new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*${attr}=["']${esc}["']`, "i"),
    )
  );
}

/** og:* and twitter:* are emitted with either attribute in the wild — accept both. */
function socialMeta(html: string, key: string): string | null {
  return meta(html, key, "property") ?? meta(html, key, "name");
}

function parseHead(html: string) {
  return {
    title: pick(html, /<title[^>]*>([\s\S]*?)<\/title>/i),
    canonical:
      pick(html, /<link[^>]+rel=["']canonical["'][^>]*href=["']([^"']+)["']/i) ??
      pick(html, /<link[^>]+href=["']([^"']+)["'][^>]*rel=["']canonical["']/i),
    ogUrl: socialMeta(html, "og:url"),
    ogTitle: socialMeta(html, "og:title"),
    ogDescription: socialMeta(html, "og:description"),
    ogImage: socialMeta(html, "og:image"),
    twitterCard: socialMeta(html, "twitter:card"),
    twitterSite: socialMeta(html, "twitter:site"),
    robots: pick(html, /<meta[^>]+name=["']robots["'][^>]*content=["']([^"']+)["']/i),
    canonicalCount: (html.match(/rel=["']canonical["']/gi) ?? []).length,
  };
}


function normalisePath(p: string) {
  if (p === "/") return "/";
  return p.replace(/\/+$/, "");
}

async function auditPath(origin: string, path: string): Promise<SeoRouteAudit> {
  const base: SeoRouteAudit = {
    path,
    status: null,
    title: null,
    canonical: null,
    ogUrl: null,
    robots: null,
    ogTitle: null,
    ogDescription: null,
    ogImage: null,
    twitterCard: null,
    twitterSite: null,
    selfConsistent: false,
    hostMatches: false,
    pathMatches: false,
    socialComplete: false,
    issues: [],
  };

  try {
    const res = await fetch(`${origin}${path}`, {
      headers: { accept: "text/html" },
    });
    const html = await res.text();
    const head = parseHead(html);
    const issues: string[] = [];

    if (!res.ok) issues.push(`HTTP ${res.status}`);
    if (!head.canonical) issues.push("Missing canonical");
    if (!head.ogUrl) issues.push("Missing og:url");
    if (head.canonicalCount > 1) issues.push(`${head.canonicalCount} canonical tags`);
    if (head.robots?.includes("noindex")) issues.push("robots: noindex");

    const canonicalUrl = head.canonical ? safeUrl(head.canonical, EXPECTED_ORIGIN) : null;
    const ogUrlUrl = head.ogUrl ? safeUrl(head.ogUrl, EXPECTED_ORIGIN) : null;

    const selfConsistent =
      !!canonicalUrl && !!ogUrlUrl && canonicalUrl.href === ogUrlUrl.href;
    if (canonicalUrl && ogUrlUrl && !selfConsistent)
      issues.push("canonical and og:url differ");

    const expected = new URL(EXPECTED_ORIGIN);
    const hostMatches =
      !!canonicalUrl &&
      canonicalUrl.host === expected.host &&
      canonicalUrl.protocol === expected.protocol &&
      (!ogUrlUrl || (ogUrlUrl.host === expected.host && ogUrlUrl.protocol === expected.protocol));
    if (canonicalUrl && !hostMatches)
      issues.push(`Host mismatch (${canonicalUrl.host} ≠ ${expected.host})`);

    const pathMatches =
      !!canonicalUrl && normalisePath(canonicalUrl.pathname) === normalisePath(path);
    if (canonicalUrl && !pathMatches)
      issues.push(`Canonical points at ${canonicalUrl.pathname}`);

    // --- social card validation -------------------------------------------
    const socialIssues: string[] = [];
    if (!head.ogTitle) socialIssues.push("Missing og:title");
    else if (head.ogTitle.length > 95) socialIssues.push("og:title over 95 chars");

    if (!head.ogDescription) socialIssues.push("Missing og:description");
    else if (head.ogDescription.length > 200)
      socialIssues.push("og:description over 200 chars");

    const ogImageUrl = head.ogImage ? safeUrl(head.ogImage, EXPECTED_ORIGIN) : null;
    if (!head.ogImage) socialIssues.push("Missing og:image");
    else if (!ogImageUrl || !/^https?:$/.test(ogImageUrl.protocol))
      socialIssues.push("og:image is not an absolute http(s) URL");
    else if (!/^https:/.test(head.ogImage))
      socialIssues.push("og:image must be an absolute https URL");

    if (!head.twitterCard) socialIssues.push("Missing twitter:card");
    else if (!VALID_TWITTER_CARDS.includes(head.twitterCard))
      socialIssues.push(`Invalid twitter:card "${head.twitterCard}"`);
    else if (head.ogImage && head.twitterCard === "summary")
      socialIssues.push("twitter:card is summary despite an og:image (use summary_large_image)");

    if (!head.twitterSite) socialIssues.push("Missing twitter:site");
    else if (!/^@[A-Za-z0-9_]{1,15}$/.test(head.twitterSite))
      socialIssues.push(`twitter:site "${head.twitterSite}" is not an @handle`);

    issues.push(...socialIssues);

    return {
      ...base,
      status: res.status,
      title: head.title,
      canonical: head.canonical,
      ogUrl: head.ogUrl,
      robots: head.robots,
      ogTitle: head.ogTitle,
      ogDescription: head.ogDescription,
      ogImage: head.ogImage,
      twitterCard: head.twitterCard,
      twitterSite: head.twitterSite,
      selfConsistent,
      hostMatches,
      pathMatches,
      socialComplete: socialIssues.length === 0,
      issues,
    };

  } catch (err) {
    return {
      ...base,
      issues: ["Fetch failed"],
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function safeUrl(value: string, base: string): URL | null {
  try {
    return new URL(value, base);
  } catch {
    return null;
  }
}

async function readSitemapPaths(origin: string): Promise<string[]> {
  try {
    const res = await fetch(`${origin}/sitemap.xml`);
    if (!res.ok) return ["/"];
    const xml = await res.text();
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim());
    const paths = locs
      .map((loc) => safeUrl(loc, EXPECTED_ORIGIN)?.pathname)
      .filter((p): p is string => !!p);
    return [...new Set(paths)];
  } catch {
    return ["/"];
  }
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>) {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (cursor < items.length) {
        const index = cursor++;
        results[index] = await fn(items[index]);
      }
    }),
  );
  return results;
}

/**
 * Fetches every sitemap route from the currently running deployment and
 * extracts its canonical / og:url so host + path mismatches are visible
 * before publishing.
 */
export const auditSeoUrls = createServerFn({ method: "GET" }).handler(
  async (): Promise<SeoPreviewResult> => {
    const { getRequest } = await import("@tanstack/react-start/server");
    const request = getRequest();
    const requestUrl = new URL(request.url);
    const proto = request.headers.get("x-forwarded-proto") ?? requestUrl.protocol.replace(":", "");
    const host = request.headers.get("host") ?? requestUrl.host;
    const checkedOrigin = `${proto}://${host}`;

    const paths = await readSitemapPaths(checkedOrigin);
    const routes = await mapLimit(paths, 6, (p) => auditPath(checkedOrigin, p));

    return {
      expectedOrigin: EXPECTED_ORIGIN,
      checkedOrigin,
      generatedAt: new Date().toISOString(),
      routes,
    };
  },
);
