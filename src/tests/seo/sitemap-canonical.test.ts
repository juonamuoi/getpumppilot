import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { BLOG_POSTS } from "@/lib/blog-posts";
import { ASSETS } from "@/lib/mock-data";
import {
  CANONICAL_ORIGIN,
  checkRedirectShape,
  checkRouteCanonical,
  formatIssues,
  parseSitemapLocs,
  toPathname,
  validateSitemap,
  type RouteCanonical,
} from "@/lib/sitemap-canonical-validate";


/**
 * Sitemap + canonical guard (CI).
 *
 * Loads every page route, invokes head() the way TanStack Router does, reads
 * the emitted <link rel="canonical">, and cross-checks it against both the
 * path the route serves and the URLs advertised in public/sitemap.xml.
 */

const routeModules = import.meta.glob("/src/routes/**/*.tsx");

const SAMPLE_PARAMS: Record<string, string> = {
  symbol: "btc",
  slug: "pumppilot-vs-autopilot-comparison",
  variant: "momentum-scanner",
  $: "sample",
};

/** Non-HTML, internal, or intentionally unindexed routes. */
const SKIP = [
  /\/routes\/api\//,
  /\/routes\/\[/,
  /__root\.tsx$/,
  /embed\./,
  /mcp-console/,
  /go-live-test/,
  /storage-audit/,
  /lp-report/,
  /ads-report/,
  /seo-preview/,
  /settings\./,
];

/**
 * Every value a dynamic segment can take, so each generated URL is validated
 * against its own canonical instead of only one sample.
 */
const DYNAMIC_VALUES: Record<string, string[]> = {
  slug: BLOG_POSTS.map((p) => p.slug),
  symbol: ASSETS.map((a) => a.symbol.toLowerCase()),
};

/** Routes that render HTML but are deliberately left out of the sitemap. */
const NOT_IN_SITEMAP = new Set(["/lp/momentum-scanner"]);


type HeadLink = { rel?: string; href?: string };
type HeadFn = (ctx: { params: Record<string, string>; loaderData: unknown; match: unknown }) =>
  | { links?: HeadLink[]; meta?: Array<Record<string, string>> }
  | undefined;

type RouteOptions = {
  head?: HeadFn;
  loader?: (ctx: { params: Record<string, string> }) => unknown;
};

/** All param combinations a route should be validated with. */
function paramSetsFor(id: string): Record<string, string>[] {
  const keys = [...id.matchAll(/\$([a-zA-Z0-9_]*)/g)].map((m) => m[1] || "$");
  let sets: Record<string, string>[] = [{}];
  for (const key of keys) {
    const values = DYNAMIC_VALUES[key] ?? [SAMPLE_PARAMS[key] ?? "sample"];
    sets = sets.flatMap((base) => values.map((value) => ({ ...base, [key]: value })));
  }
  return sets;
}

/** "/src/routes/blog.$slug.tsx" + params -> "/blog/<slug>" */
function pathFor(id: string, params: Record<string, string>) {
  let path = id.replace("/src/routes/", "").replace(/\.tsx$/, "");
  path = path.replace(/\.index$/, "").replace(/^index$/, "");
  path = path.split(".").join("/");
  path = "/" + path.replace(/^\/+/, "");
  path = path.replace(/\$([a-zA-Z0-9_]*)/g, (_m, key: string) => params[key || "$"] ?? "sample");
  return path.length > 1 ? path.replace(/\/+$/, "") : "/";
}

async function loaderDataFor(options: RouteOptions | undefined, params: Record<string, string>) {
  if (typeof options?.loader !== "function") return undefined;
  try {
    return await Promise.race([
      Promise.resolve(options.loader({ params })),
      new Promise((r) => setTimeout(() => r(undefined), 1500)),
    ]);
  } catch {
    return undefined;
  }
}

const routeFiles = Object.keys(routeModules)
  .filter((p) => !SKIP.some((re) => re.test(p)))
  .sort();

let cached: Promise<RouteCanonical[]> | null = null;

function collectRouteCanonicals(): Promise<RouteCanonical[]> {
  cached ??= (async () => {
    const out: RouteCanonical[] = [];
    for (const file of routeFiles) {
      const mod = (await routeModules[file]()) as { Route?: { options?: RouteOptions } };
      const options = mod.Route?.options;
      if (typeof options?.head !== "function") continue;
      for (const params of paramSetsFor(file)) {
        const loaderData = await loaderDataFor(options, params);
        const head = options.head({ params, loaderData, match: {} }) ?? {};
        const canonical = head.links?.find((l) => l.rel === "canonical")?.href;
        const noindex = head.meta?.some((m) => m.name === "robots" && /noindex/i.test(m.content ?? ""));
        out.push({ id: `${file} ${JSON.stringify(params)}`, path: pathFor(file, params), canonical, noindex });
      }
    }
    return out;
  })();
  return cached;
}

const sitemapXml = readFileSync(resolve(process.cwd(), "public/sitemap.xml"), "utf8");


describe("sitemap + canonical validation", () => {
  it("finds page routes and sitemap URLs to check", () => {
    expect(routeFiles.length).toBeGreaterThan(10);
    expect(parseSitemapLocs(sitemapXml).length).toBeGreaterThan(10);
  });

  it("every indexable route self-references its canonical", async () => {
    const routes = await collectRouteCanonicals();
    const issues = routes.flatMap(checkRouteCanonical);
    expect(issues, `\n${formatIssues(issues)}\n`).toEqual([]);
  });

  it("no sitemap URL would redirect", () => {
    const issues = parseSitemapLocs(sitemapXml).flatMap(checkRedirectShape);
    expect(issues, `\n${formatIssues(issues)}\n`).toEqual([]);
  });

  it("sitemap URLs match route canonicals, with no gaps or duplicates", async () => {
    const routes = await collectRouteCanonicals();
    const canonicalPaths = new Set(
      routes
        .filter((r) => !r.noindex && r.canonical)
        .map((r) => toPathname(r.canonical!))
        .filter((p): p is string => Boolean(p)),
    );
    // Asset detail pages are generated per symbol; accept any /asset/* in the sitemap.
    for (const loc of parseSitemapLocs(sitemapXml)) {
      const path = toPathname(loc);
      if (path?.startsWith("/asset/")) canonicalPaths.add(path);
    }

    const expected = new Set(
      routes
        .filter((r) => !r.noindex && r.canonical && !NOT_IN_SITEMAP.has(r.path))
        .map((r) => toPathname(r.canonical!)!)
        .filter(Boolean),
    );

    const issues = validateSitemap(sitemapXml, canonicalPaths, expected);
    expect(issues, `\n${formatIssues(issues)}\n`).toEqual([]);
  });

  it("detects mismatched, missing, and redirecting URLs", () => {
    expect(checkRouteCanonical({ id: "x", path: "/a", canonical: `${CANONICAL_ORIGIN}/b` })[0].code).toBe(
      "canonical_mismatch",
    );
    expect(checkRouteCanonical({ id: "x", path: "/a" })[0].code).toBe("missing_canonical");
    expect(checkRedirectShape(`${CANONICAL_ORIGIN}/Asset/BTC`)[0].code).toBe("redirect_uppercase");
    expect(checkRedirectShape("http://getpumppilot.app/pricing").map((i) => i.code)).toContain("redirect_http");
  });
});
