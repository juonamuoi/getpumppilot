import { describe, expect, it } from "vitest";
import { breadcrumbSchema, SITE_URL } from "@/lib/structured-data";
import { validateJsonLd } from "@/lib/jsonld-validate";
import { BLOG_POSTS } from "@/lib/blog-posts";

/**
 * BreadcrumbList guard: asset detail pages and blog posts must each emit a
 * valid breadcrumb trail so Google can render breadcrumbs in rich results.
 */

type LdScript = { type?: string; children?: string };
type RouteOptions = {
  head?: (ctx: { params: Record<string, string>; loaderData: unknown }) => {
    scripts?: LdScript[];
  };
  loader?: (ctx: { params: Record<string, string> }) => unknown;
};

const routeModules = import.meta.glob("/src/routes/**/*.tsx");

async function breadcrumbsFor(routePath: string, params: Record<string, string>) {
  const loadRoute = routeModules[routePath];
  expect(loadRoute, `${routePath} exists`).toBeTruthy();
  const mod = (await loadRoute()) as { Route?: { options?: RouteOptions } };
  const options = mod.Route?.options;
  const loaderData = options?.loader ? await options.loader({ params }) : undefined;
  const scripts = options?.head?.({ params, loaderData })?.scripts ?? [];
  return scripts
    .filter((s) => s.type === "application/ld+json" && s.children)
    .flatMap((s) => {
      const parsed = JSON.parse(s.children as string) as Record<string, unknown>;
      const graph = parsed["@graph"];
      return Array.isArray(graph) ? (graph as Record<string, unknown>[]) : [parsed];
    })
    .filter((node) => node["@type"] === "BreadcrumbList");
}

function expectValidTrail(nodes: Record<string, unknown>[], lastUrl: string) {
  expect(nodes).toHaveLength(1);
  const node = nodes[0];
  expect(
    validateJsonLd({ "@context": "https://schema.org", ...node }, "breadcrumb"),
  ).toEqual([]);
  const items = node.itemListElement as { position: number; name: string; item: string }[];
  expect(items.length).toBeGreaterThanOrEqual(3);
  expect(items[0]).toMatchObject({ position: 1, name: "Home", item: `${SITE_URL}/` });
  items.forEach((item, i) => {
    expect(item.position).toBe(i + 1);
    expect(item.name.trim().length).toBeGreaterThan(0);
    expect(item.item.startsWith(`${SITE_URL}/`)).toBe(true);
  });
  expect(items[items.length - 1].item).toBe(lastUrl);
  expect(node["@id"]).toBe(`${lastUrl}#breadcrumb`);
}

describe("BreadcrumbList structured data", () => {
  it("asset detail pages emit a Home › Scanner › SYMBOL trail", async () => {
    const nodes = await breadcrumbsFor("/src/routes/asset.$symbol.tsx", { symbol: "btc" });
    expectValidTrail(nodes, `${SITE_URL}/asset/btc`);
    const items = nodes[0].itemListElement as { name: string }[];
    expect(items[1].name).toBe("Scanner");
  });

  it.each(BLOG_POSTS.map((p) => p.slug))("blog post %s emits a valid trail", async (slug) => {
    const nodes = await breadcrumbsFor("/src/routes/blog.$slug.tsx", { slug });
    expectValidTrail(nodes, `${SITE_URL}/blog/${slug}`);
    const items = nodes[0].itemListElement as { name: string }[];
    expect(items[1].name).toBe("Blog");
  });

  it("helper always anchors the trail at Home", () => {
    const schema = breadcrumbSchema([{ name: "Learn", path: "/learn" }]);
    expect(validateJsonLd(schema, "helper")).toEqual([]);
    expect((schema.itemListElement as { name: string }[])[0].name).toBe("Home");
  });
});
