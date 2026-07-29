/**
 * Sitemap + canonical validation.
 *
 * Cross-checks the URLs advertised in `public/sitemap.xml` against the
 * `<link rel="canonical">` each route actually emits from its `head()`.
 *
 * Flags:
 *  - missing canonical on an indexable route
 *  - canonical that points somewhere other than the page itself
 *  - sitemap URLs whose canonical points elsewhere (self-reference broken)
 *  - sitemap URLs that would redirect (http://, non-canonical host,
 *    trailing slash, uppercase path, query strings, hash fragments)
 *  - routes in the sitemap that no route file serves, and indexable routes
 *    missing from the sitemap
 */

export const CANONICAL_ORIGIN = "https://www.getpumppilot.app";

export type UrlIssueCode =
  | "missing_canonical"
  | "canonical_mismatch"
  | "canonical_not_absolute"
  | "canonical_wrong_origin"
  | "redirect_http"
  | "redirect_host"
  | "redirect_trailing_slash"
  | "redirect_uppercase"
  | "redirect_query_or_hash"
  | "sitemap_unknown_route"
  | "sitemap_missing_route"
  | "sitemap_duplicate";

export interface UrlIssue {
  code: UrlIssueCode;
  url: string;
  message: string;
}

/** Extract `<loc>` values from a sitemap XML string. */
export function parseSitemapLocs(xml: string): string[] {
  return [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1]);
}

/** Normalize a URL/path to a comparable pathname ("/" kept, no trailing slash). */
export function toPathname(value: string): string | null {
  try {
    const url = value.startsWith("/") ? new URL(value, CANONICAL_ORIGIN) : new URL(value);
    const path = url.pathname;
    return path.length > 1 ? path.replace(/\/+$/, "") : "/";
  } catch {
    return null;
  }
}

/** Detect URL shapes that force a redirect before the canonical page is served. */
export function checkRedirectShape(rawUrl: string): UrlIssue[] {
  const issues: UrlIssue[] = [];
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return [{ code: "canonical_not_absolute", url: rawUrl, message: "Not an absolute URL." }];
  }

  if (url.protocol !== "https:") {
    issues.push({ code: "redirect_http", url: rawUrl, message: "Uses http:// — redirects to https://." });
  }
  if (url.origin !== CANONICAL_ORIGIN) {
    issues.push({
      code: "redirect_host",
      url: rawUrl,
      message: `Host ${url.host} redirects to ${new URL(CANONICAL_ORIGIN).host}.`,
    });
  }
  if (url.pathname.length > 1 && url.pathname.endsWith("/")) {
    issues.push({
      code: "redirect_trailing_slash",
      url: rawUrl,
      message: "Trailing slash redirects to the slash-less path.",
    });
  }
  if (url.pathname !== url.pathname.toLowerCase()) {
    issues.push({
      code: "redirect_uppercase",
      url: rawUrl,
      message: "Uppercase path segment does not match the lowercase canonical.",
    });
  }
  if (url.search || url.hash) {
    issues.push({
      code: "redirect_query_or_hash",
      url: rawUrl,
      message: "Query string or hash fragment must not appear in the sitemap.",
    });
  }
  return issues;
}

export interface RouteCanonical {
  /** Route file id, for reporting. */
  id: string;
  /** Pathname the route serves, e.g. "/asset/btc". */
  path: string;
  /** Canonical href emitted by head(), if any. */
  canonical?: string;
  /** Route is intentionally excluded from indexing (noindex / internal). */
  noindex?: boolean;
}

/** Validate one route's canonical against the path it serves. */
export function checkRouteCanonical(route: RouteCanonical): UrlIssue[] {
  if (route.noindex) return [];
  const issues: UrlIssue[] = [];

  if (!route.canonical) {
    return [
      { code: "missing_canonical", url: route.path, message: `${route.id} emits no <link rel="canonical">.` },
    ];
  }
  if (!/^https?:\/\//.test(route.canonical)) {
    return [
      {
        code: "canonical_not_absolute",
        url: route.canonical,
        message: `${route.id} canonical must be absolute.`,
      },
    ];
  }

  const canonicalUrl = new URL(route.canonical);
  if (canonicalUrl.origin !== CANONICAL_ORIGIN) {
    issues.push({
      code: "canonical_wrong_origin",
      url: route.canonical,
      message: `${route.id} canonical points at ${canonicalUrl.origin}, not ${CANONICAL_ORIGIN}.`,
    });
  }
  if (toPathname(route.canonical) !== toPathname(route.path)) {
    issues.push({
      code: "canonical_mismatch",
      url: route.canonical,
      message: `${route.id} serves ${route.path} but its canonical is ${canonicalUrl.pathname}.`,
    });
  }
  return issues;
}

/**
 * Validate the sitemap against the set of canonical pathnames the app serves.
 *
 * `canonicalPaths` is the set of self-referencing canonical pathnames
 * (normalized) that routes emit. `expectedPaths` are paths that should be
 * advertised in the sitemap.
 */
export function validateSitemap(
  xml: string,
  canonicalPaths: Set<string>,
  expectedPaths: Set<string> = new Set(),
): UrlIssue[] {
  const issues: UrlIssue[] = [];
  const locs = parseSitemapLocs(xml);
  const seen = new Set<string>();

  for (const loc of locs) {
    issues.push(...checkRedirectShape(loc));

    const path = toPathname(loc);
    if (!path) continue;

    if (seen.has(path)) {
      issues.push({ code: "sitemap_duplicate", url: loc, message: `${path} is listed more than once.` });
    }
    seen.add(path);

    if (canonicalPaths.size > 0 && !canonicalPaths.has(path)) {
      issues.push({
        code: "sitemap_unknown_route",
        url: loc,
        message: `${path} is in the sitemap but no route emits it as its own canonical.`,
      });
    }
  }

  for (const expected of expectedPaths) {
    if (!seen.has(expected)) {
      issues.push({
        code: "sitemap_missing_route",
        url: expected,
        message: `${expected} is indexable but missing from sitemap.xml.`,
      });
    }
  }

  return issues;
}

export function formatIssues(issues: UrlIssue[]): string {
  return issues.map((i) => `  [${i.code}] ${i.url} — ${i.message}`).join("\n");
}
