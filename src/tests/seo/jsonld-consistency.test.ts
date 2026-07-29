import { describe, expect, it } from "vitest";
import { validateJsonLdSource, type JsonLdIssue } from "@/lib/jsonld-validate";

/**
 * JSON-LD consistency guard (CI).
 *
 * Loads every page route module, invokes its `head()` exactly the way
 * TanStack Router does, and validates each emitted `application/ld+json`
 * script: valid JSON, correct @context/@type, required fields present, and
 * no broken/relative/placeholder URLs.
 */

const routeModules = import.meta.glob("/src/routes/**/*.tsx");

/** Sample params for dynamic segments so `head({ params })` can be called. */
const SAMPLE_PARAMS: Record<string, string> = {
  symbol: "btc",
  slug: "pumppilot-vs-autopilot-comparison",
  variant: "momentum-scanner",
  $: "sample",
};

/** Routes that never render HTML (API/server-only or embed frames). */
const SKIP = [/\/routes\/api\//, /\/routes\/\[/, /__root\.tsx$/];

type LdScript = { type?: string; children?: string };

type HeadFn = (ctx: {
  params: Record<string, string>;
  loaderData: unknown;
  match: unknown;
}) => { scripts?: LdScript[] } | undefined;

type RouteOptions = {
  head?: HeadFn;
  loader?: (ctx: { params: Record<string, string> }) => unknown;
};


function paramsFor(id: string) {
  const params: Record<string, string> = {};
  for (const match of id.matchAll(/\$([a-zA-Z0-9_]*)/g)) {
    const key = match[1] || "$";
    params[key] = SAMPLE_PARAMS[key] ?? "sample";
  }
  return params;
}
/**
 * Some routes build their JSON-LD from loader data. Run the loader with the
 * sample params when it is cheap and synchronous; fall back to undefined so
 * the pending/error render pass is still validated.
 */
async function loaderDataFor(
  options: { loader?: (ctx: { params: Record<string, string> }) => unknown } | undefined,
  params: Record<string, string>,
) {
  if (typeof options?.loader !== "function") return undefined;
  try {
    return await Promise.race([
      Promise.resolve(options.loader({ params })),
      new Promise((resolve) => setTimeout(() => resolve(undefined), 1500)),
    ]);
  } catch {
    return undefined;
  }
}


const routeFiles = Object.keys(routeModules)
  .filter((path) => !SKIP.some((re) => re.test(path)))
  .sort();

describe("JSON-LD consistency", () => {
  it("finds page routes to check", () => {
    expect(routeFiles.length).toBeGreaterThan(10);
  });

  it.each(routeFiles)("%s emits only valid JSON-LD", async (path) => {
    const mod = (await routeModules[path]()) as { Route?: { options?: RouteOptions } };
    const options = mod.Route?.options;
    const head = options?.head;
    if (typeof head !== "function") return;

    const params = paramsFor(path);
    const loaded = await loaderDataFor(options, params);
    const issues: JsonLdIssue[] = [];

    // Validate both render passes: with loader data, and the pending/error
    // pass where loaderData is undefined.
    for (const loaderData of [loaded, undefined]) {
      let result: ReturnType<HeadFn>;
      try {
        result = head({ params, loaderData, match: { params } });
      } catch (err) {
        throw new Error(`head() threw for ${path}: ${(err as Error).message}`);
      }
      const scripts = (result?.scripts ?? []).filter(
        (s) => s?.type === "application/ld+json" && typeof s.children === "string",
      );
      scripts.forEach((script, i) => {
        issues.push(...validateJsonLdSource(script.children as string, `${path}#${i}`));
      });
    }

    expect(
      Array.from(new Set(issues.map((issue) => `${issue.path}: ${issue.message}`))),
      `Invalid JSON-LD in ${path}`,
    ).toEqual([]);
  });

  it("key journey routes are schema-enriched", async () => {
    const required = [
      "/src/routes/index.tsx",
      "/src/routes/alerts.tsx",
      "/src/routes/asset.$symbol.tsx",
      "/src/routes/paper.tsx",
      "/src/routes/strategy.tsx",
      "/src/routes/blog.$slug.tsx",
      "/src/routes/blog.index.tsx",
      "/src/routes/pricing.tsx",
    ];

    for (const path of required) {
      const loadModule = routeModules[path];
      expect(loadModule, `${path} is missing`).toBeDefined();
      const mod = (await loadModule()) as { Route?: { options?: RouteOptions } };
      const options = mod.Route?.options;
      expect(typeof options?.head, `${path} has no head()`).toBe("function");
      const params = paramsFor(path);
      const loaderData = await loaderDataFor(options, params);
      const scripts = (
        options!.head!({ params, loaderData, match: { params } })?.scripts ?? []
      ).filter((s) => s?.type === "application/ld+json");
      expect(scripts.length, `${path} emits no JSON-LD`).toBeGreaterThan(0);
    }
  });
});

