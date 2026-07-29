/**
 * SEO health checks for the pages a mitigation touches.
 *
 * A mitigation changes which assets match the scanner, which in turn changes
 * which public asset pages get promoted in alerts and internal links. Before
 * and after a replay we re-run the same three crawl checks per page:
 *
 *  - canonical: does the page self-reference the canonical origin/path?
 *  - robots:    is the path crawlable per public/robots.txt?
 *  - redirect:  does the advertised URL redirect before serving?
 */

import { CANONICAL_ORIGIN, checkRedirectShape, checkRouteCanonical, toPathname } from "./sitemap-canonical-validate";

/** Kept in sync with public/robots.txt. */
export const ROBOTS_DISALLOW = [
  "/ads-report",
  "/lp-report",
  "/go-live-test",
  "/mcp-console",
  "/mcp",
  "/seo-preview",
  "/seo-monitor",
];

export type CheckStatus = "pass" | "fail";

export type PageSeoCheck = {
  /** Asset symbol the page belongs to, e.g. "BTC". */
  symbol: string;
  /** Absolute URL as it would be advertised. */
  url: string;
  path: string;
  canonical: { status: CheckStatus; detail: string };
  robots: { status: CheckStatus; detail: string };
  redirect: { status: CheckStatus; detail: string };
};

export type SeoSnapshot = {
  pages: PageSeoCheck[];
  passing: number;
  failing: number;
};

export function robotsAllowed(path: string): boolean {
  return !ROBOTS_DISALLOW.some((d) => path === d || path.startsWith(`${d}/`));
}

/** Run the three crawl checks for one asset page. */
export function checkAssetPage(symbol: string): PageSeoCheck {
  const raw = `${CANONICAL_ORIGIN}/asset/${symbol}`;
  const path = toPathname(raw) ?? `/asset/${symbol.toLowerCase()}`;
  const canonicalHref = `${CANONICAL_ORIGIN}/asset/${symbol.toLowerCase()}`;

  const redirectIssues = checkRedirectShape(raw);
  const canonicalIssues = checkRouteCanonical({
    id: `/asset/${symbol.toLowerCase()}`,
    path: `/asset/${symbol.toLowerCase()}`,
    canonical: canonicalHref,
  });
  const allowed = robotsAllowed(`/asset/${symbol.toLowerCase()}`);

  return {
    symbol,
    url: raw,
    path,
    canonical:
      canonicalIssues.length === 0
        ? { status: "pass", detail: `Self-canonical → ${canonicalHref}` }
        : { status: "fail", detail: canonicalIssues.map((i) => i.message).join(" ") },
    robots: allowed
      ? { status: "pass", detail: "Crawlable (Allow: /)" }
      : { status: "fail", detail: "Blocked by a Disallow rule in robots.txt" },
    redirect:
      redirectIssues.length === 0
        ? { status: "pass", detail: "Serves 200 at the canonical URL" }
        : { status: "fail", detail: redirectIssues.map((i) => i.message).join(" ") },
  };
}

/** Build a snapshot for every symbol a mitigation surfaced. */
export function seoSnapshot(symbols: string[]): SeoSnapshot {
  const pages = [...new Set(symbols.map((s) => s.trim()).filter(Boolean))]
    .sort()
    .map(checkAssetPage);
  const failing = pages.filter(
    (p) => p.canonical.status === "fail" || p.robots.status === "fail" || p.redirect.status === "fail",
  ).length;
  return { pages, passing: pages.length - failing, failing };
}

export type CheckKey = "canonical" | "robots" | "redirect";

export type PageSeoDiff = {
  symbol: string;
  presence: "both" | "added" | "removed";
  before?: PageSeoCheck;
  after?: PageSeoCheck;
  /** Checks whose status flipped between the two snapshots. */
  changed: CheckKey[];
};

export type SeoSnapshotDiff = {
  rows: PageSeoDiff[];
  added: string[];
  removed: string[];
  regressions: number;
  improvements: number;
  unchanged: boolean;
};

const KEYS: CheckKey[] = ["canonical", "robots", "redirect"];

/** Compare two snapshots page by page and check by check. */
export function diffSeoSnapshots(before: SeoSnapshot, after: SeoSnapshot): SeoSnapshotDiff {
  const beforeMap = new Map(before.pages.map((p) => [p.symbol, p]));
  const afterMap = new Map(after.pages.map((p) => [p.symbol, p]));
  const symbols = [...new Set([...beforeMap.keys(), ...afterMap.keys()])].sort();

  let regressions = 0;
  let improvements = 0;
  const rows: PageSeoDiff[] = symbols.map((symbol) => {
    const b = beforeMap.get(symbol);
    const a = afterMap.get(symbol);
    const changed: CheckKey[] = [];
    if (b && a) {
      for (const k of KEYS) {
        if (b[k].status !== a[k].status) {
          changed.push(k);
          if (a[k].status === "fail") regressions += 1;
          else improvements += 1;
        }
      }
    }
    return {
      symbol,
      presence: b && a ? "both" : a ? "added" : "removed",
      before: b,
      after: a,
      changed,
    };
  });

  const added = rows.filter((r) => r.presence === "added").map((r) => r.symbol);
  const removed = rows.filter((r) => r.presence === "removed").map((r) => r.symbol);

  return {
    rows,
    added,
    removed,
    regressions,
    improvements,
    unchanged: added.length === 0 && removed.length === 0 && regressions === 0 && improvements === 0,
  };
}
