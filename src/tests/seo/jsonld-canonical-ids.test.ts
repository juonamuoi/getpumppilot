import { describe, expect, it } from "vitest";
import { canonicalUrl, SITE_URL } from "@/lib/structured-data";

/**
 * Canonical / @id consistency guard (CI).
 *
 * Every page must advertise exactly ONE URL for itself, and every JSON-LD
 * node it emits must hang off that URL with a `<canonical>#<node>` @id.
 * Mismatches are the usual cause of "duplicate page / duplicate entity"
 * warnings in Search Console and the Rich Results Test.
 */

const routeModules = import.meta.glob("/src/routes/**/*.tsx");

const SAMPLE_PARAMS: Record<string, string> = {
  symbol: "btc",
  slug: "pumppilot-vs-autopilot-comparison",
  variant: "momentum-scanner",
  $: "sample",
};

const SKIP = [/\/routes\/api\//, /__root\.tsx$/];

/** Ad landing variants deliberately canonicalise to the homepage (noindex). */
const CANONICALISES_ELSEWHERE = [/\/routes\/lp\./];

type Tag = Record<string, string>;
type Script = { type?: string; children?: string };
type HeadResult = { meta?: Tag[]; links?: Tag[]; scripts?: Script[] } | undefined;
type RouteOptions = {
  head?: (ctx: { params: Record<string, string>; loaderData: unknown; match: unknown }) => HeadResult;
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

async function loaderDataFor(options: RouteOptions | undefined, params: Record<string, string>) {
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

describe("JSON-LD canonical + @id scheme", () => {
  it.each(routeFiles)("%s binds its schema to its canonical URL", async (path) => {
    const mod = (await routeModules[path]()) as { Route?: { options?: RouteOptions } };
    const options = mod.Route?.options;
    if (typeof options?.head !== "function") return;

    const params = paramsFor(path);
    const loaderData = await loaderDataFor(options, params);
    const head = options.head({ params, loaderData, match: { params } });

    const canonical = head?.links?.find((l) => l.rel === "canonical")?.href;
    const ogUrl = head?.meta?.find((m) => m.property === "og:url")?.content;
    const scripts = (head?.scripts ?? []).filter(
      (s) => s?.type === "application/ld+json" && typeof s.children === "string",
    );

    if (!canonical && scripts.length === 0) return;

    expect(canonical, `${path} emits JSON-LD but no canonical link`).toBeTruthy();
    expect(canonical!.startsWith(`${SITE_URL}/`), `${path} canonical must be absolute`).toBe(true);
    // Canonical must already be in normalised form (no duplicate spelling).
    expect(canonicalUrl(canonical!.replace(SITE_URL, "")), `${path} canonical is not normalised`).toBe(
      canonical,
    );

    if (ogUrl && !CANONICALISES_ELSEWHERE.some((re) => re.test(path))) {
      expect(ogUrl, `${path} og:url must equal the canonical URL`).toBe(canonical);
    }

    if (CANONICALISES_ELSEWHERE.some((re) => re.test(path))) return;

    const seen = new Set<string>();
    for (const script of scripts) {
      const node = JSON.parse(script.children as string) as Record<string, unknown>;
      const nodes = Array.isArray(node["@graph"])
        ? (node["@graph"] as Record<string, unknown>[])
        : [node];

      for (const n of nodes) {
        const id = n["@id"] as string | undefined;
        expect(id, `${path}: top-level ${String(n["@type"])} node has no @id`).toBeTruthy();
        expect(
          id!.startsWith(`${canonical}#`),
          `${path}: @id "${id}" is not scoped to canonical "${canonical}"`,
        ).toBe(true);
        expect(seen.has(id!), `${path}: duplicate @id "${id}" on one page`).toBe(false);
        seen.add(id!);

        const url = n.url as string | undefined;
        if (typeof url === "string") {
          expect(url, `${path}: node url "${url}" must be the canonical URL`).toBe(canonical);
        }
        const mainEntity = n.mainEntityOfPage as { "@id"?: string } | undefined;
        if (mainEntity?.["@id"]) {
          expect(
            mainEntity["@id"],
            `${path}: mainEntityOfPage must point at the canonical URL`,
          ).toBe(canonical);
        }
      }
    }
  });
});
