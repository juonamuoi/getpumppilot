/**
 * Auth-aware indexing policy.
 *
 * Single source of truth for "should a crawler index this route?".
 *
 * Three classes of route:
 *
 *  - `public`   — marketing / content / docs. Indexable, self-canonical.
 *  - `gated`    — wallet- or session-gated app surfaces. A crawler only ever
 *                 sees the empty "connect your wallet" shell, so the page has
 *                 no indexable content and would look thin/duplicated in
 *                 search. These emit `noindex, follow` (links still flow) and
 *                 are kept OUT of the sitemap — but they stay CRAWLABLE in
 *                 robots.txt, because a `Disallow` would hide the very
 *                 `noindex` we want Google to read.
 *  - `internal` — admin dashboards, test harnesses, embeds. `noindex, nofollow`
 *                 AND disallowed in robots.txt.
 *
 * `scripts/gen-sitemap.mjs` drops any route file containing `noindex`, so
 * annotating a route through this module automatically removes it from
 * `public/sitemap.xml` on the next `gen:sitemap` run.
 */

export type IndexPolicy = "public" | "gated" | "internal";

export const CANONICAL_ORIGIN = "https://www.getpumppilot.app";

/** Wallet/session-gated app surfaces: crawlable, never indexed. */
export const WALLET_GATED_ROUTES = [
  // Sign-in screen: no indexable content, and Google reports it as an
  // "affected page" when it sits in the sitemap without unique content.
  "/auth",
  "/login",
  "/dashboard",
  "/approvals",
  "/journal",
  "/paper",
  "/trade",

  "/alerts",
  "/risk",
  "/copilot",
  "/backtest",
  "/strategy",
  "/security",
  "/pump-history",
] as const;

/** Internal tooling: noindex + robots.txt Disallow. */
export const INTERNAL_ROUTES = [
  "/ads-report",
  "/lp-report",
  "/seo-preview",
  "/seo-monitor",
  "/storage-audit",
  "/mcp-console",
  "/mcp",
  "/go-live-test",
  "/doctor",
  "/settings",
  "/embed/momentum",
] as const;

const GATED = new Set<string>(WALLET_GATED_ROUTES);
const INTERNAL = new Set<string>(INTERNAL_ROUTES);

/** Normalize to a comparable pathname ("/" kept, no trailing slash, lowercase). */
export function normalizePath(value: string): string {
  const path = value.startsWith("http") ? new URL(value).pathname : value;
  const trimmed = path.length > 1 ? path.replace(/\/+$/, "") : "/";
  return trimmed.toLowerCase();
}

export function indexPolicyFor(path: string): IndexPolicy {
  const p = normalizePath(path);
  if (INTERNAL.has(p) || [...INTERNAL].some((i) => p.startsWith(`${i}/`))) return "internal";
  if (GATED.has(p)) return "gated";
  return "public";
}

export function isIndexable(path: string): boolean {
  return indexPolicyFor(path) === "public";
}

/** The `robots` directive for a route, or `null` when it should be indexed. */
export function robotsDirectiveFor(path: string): string | null {
  switch (indexPolicyFor(path)) {
    case "gated":
      // `follow` keeps internal link equity flowing to the public pages the
      // app shell links to (pricing, learn, blog) while the screen itself
      // stays out of the index.
      return "noindex, follow";
    case "internal":
      return "noindex, nofollow";
    default:
      return null;
  }
}

export type MetaEntry = Record<string, string>;

/**
 * Robots meta entries for a route. Empty array for indexable public pages,
 * so this is safe to spread into every route's `head().meta`.
 */
export function robotsMetaFor(path: string): MetaEntry[] {
  const directive = robotsDirectiveFor(path);
  if (!directive) return [];
  return [
    { name: "robots", content: directive },
    { name: "googlebot", content: directive },
  ];
}

/** Absolute, self-referencing canonical URL for a route. */
export function canonicalFor(path: string): string {
  const p = normalizePath(path);
  return `${CANONICAL_ORIGIN}${p === "/" ? "/" : p}`;
}

/**
 * `links` for a route's `head()`. Non-indexable routes still emit a
 * self-canonical so any inbound link resolves to one URL instead of
 * spawning parameterised duplicates.
 */
export function canonicalLinkFor(path: string) {
  return [{ rel: "canonical", href: canonicalFor(path) }];
}

/**
 * Public, crawlable marketing counterpart for a wallet-gated screen.
 * The gated route keeps its own (noindex) self-canonical; this mapping is what
 * search engines and unauthenticated visitors get pointed at instead.
 */
export const PUBLIC_ALTERNATIVES: Record<string, string> = {
  "/dashboard": "/features/dashboard",
  "/journal": "/features/journal",
};

export function publicAlternativeFor(path: string): string | null {
  return PUBLIC_ALTERNATIVES[normalizePath(path)] ?? null;
}

/** Paths that robots.txt must Disallow (internal only — gated stays crawlable). */
export function robotsDisallowPaths(): string[] {
  return [...INTERNAL_ROUTES];
}
