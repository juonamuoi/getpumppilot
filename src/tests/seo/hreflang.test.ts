import { describe, expect, it } from "vitest";
import { canonicalUrl, SITE_LOCALE } from "@/lib/structured-data";

/**
 * hreflang guard (CI).
 *
 * The site publishes a single English edition, so every annotated page must
 * emit a self-referencing `en` alternate plus an `x-default` alternate that
 * points at the SAME URL as its canonical. A drifting or missing pair is the
 * usual cause of duplicate-content / wrong-locale clustering in Search
 * Console, so the routes below are locked down.
 */

const routeModules = import.meta.glob("/src/routes/**/*.tsx");

/** Routes required to carry hreflang: homepage, dashboard and journal surfaces. */
const REQUIRED: { file: string; path: string; params?: Record<string, string> }[] = [
  { file: "/src/routes/index.tsx", path: "/" },
  { file: "/src/routes/dashboard.tsx", path: "/dashboard" },
  { file: "/src/routes/journal.tsx", path: "/journal" },
  { file: "/src/routes/features.dashboard.tsx", path: "/features/dashboard" },
  { file: "/src/routes/features.journal.tsx", path: "/features/journal" },
  { file: "/src/routes/blog.index.tsx", path: "/blog" },
  {
    file: "/src/routes/blog.$slug.tsx",
    path: "/blog/pumppilot-vs-autopilot-comparison",
    params: { slug: "pumppilot-vs-autopilot-comparison" },
  },
];

type Tag = Record<string, string>;
type RouteOptions = {
  head?: (ctx: { params: Record<string, string>; loaderData: unknown; match: unknown }) => {
    links?: Tag[];
  } | undefined;
  loader?: (ctx: { params: Record<string, string> }) => unknown;
};

async function headLinks(file: string, params: Record<string, string>) {
  const loader = routeModules[file];
  expect(loader, `${file} is not a route module`).toBeTruthy();
  const mod = (await loader!()) as { Route?: { options?: RouteOptions } };
  const options = mod.Route?.options;
  expect(typeof options?.head, `${file} has no head()`).toBe("function");
  let loaderData: unknown;
  if (typeof options?.loader === "function") {
    try {
      loaderData = await options.loader({ params });
    } catch {
      loaderData = undefined;
    }
  }
  return options!.head!({ params, loaderData, match: { params } })?.links ?? [];
}

describe("hreflang annotations", () => {
  it.each(REQUIRED)("$path declares self-referencing en + x-default", async (route) => {
    const links = await headLinks(route.file, route.params ?? {});
    const expected = canonicalUrl(route.path);

    const canonical = links.find((l) => l.rel === "canonical");
    expect(canonical?.href, `${route.path} canonical`).toBe(expected);

    const alternates = links.filter((l) => l.rel === "alternate" && l.hreflang);
    const byLang = new Map(alternates.map((l) => [l.hreflang, l.href]));

    expect(byLang.get(SITE_LOCALE), `${route.path} is missing a self-referencing ${SITE_LOCALE} alternate`).toBe(
      expected,
    );
    expect(byLang.get("x-default"), `${route.path} is missing an x-default alternate`).toBe(expected);

    // Attribute must be the lowercase HTML spelling, not React's hrefLang.
    for (const l of alternates) {
      expect(l.hrefLang, `${route.path} must use lowercase "hreflang"`).toBeUndefined();
      expect(l.href.startsWith("https://"), `${route.path} hreflang href must be absolute`).toBe(true);
    }

    // One href per language — duplicates make crawlers drop the whole cluster.
    expect(byLang.size, `${route.path} has duplicate hreflang entries`).toBe(alternates.length);
  });
});
