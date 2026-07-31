import { describe, expect, it } from "vitest";
import { BLOG_POSTS } from "@/lib/blog-posts";
import { SOCIAL_IMAGE_HASHES } from "@/lib/social-image-hashes";
import {
  SITE_URL,
  SOCIAL_IMAGE_URL,
  socialImageUrl,
} from "@/lib/structured-data";

/**
 * Article image guard.
 *
 * Every journal/blog post must expose ONE image URL: the same absolute,
 * content-hashed URL in its Article (BlogPosting) JSON-LD, its `og:image`
 * and its `twitter:image`. Posts without a dedicated cover must fall back to
 * the shared, content-hashed og-cover.jpg so social crawlers never cache a
 * stale or unhashed preview.
 */

type Meta = { property?: string; name?: string; content?: string };
type LdScript = { type?: string; children?: string };
type RouteOptions = {
  head?: (ctx: { params: Record<string, string>; loaderData: unknown }) => {
    meta?: Meta[];
    scripts?: LdScript[];
  };
  loader?: (ctx: { params: Record<string, string> }) => unknown;
};

const routeModules = import.meta.glob("/src/routes/**/*.tsx");

async function headFor(routePath: string, params: Record<string, string>) {
  const loadRoute = routeModules[routePath];
  expect(loadRoute, `${routePath} exists`).toBeTruthy();
  const mod = (await loadRoute()) as { Route?: { options?: RouteOptions } };
  const options = mod.Route?.options;
  const loaderData = options?.loader ? await options.loader({ params }) : undefined;
  const head = options?.head?.({ params, loaderData }) ?? {};
  const nodes = (head.scripts ?? [])
    .filter((s) => s.type === "application/ld+json" && s.children)
    .flatMap((s) => {
      const parsed = JSON.parse(s.children as string) as Record<string, unknown>;
      const graph = parsed["@graph"];
      return Array.isArray(graph) ? (graph as Record<string, unknown>[]) : [parsed];
    });
  return { meta: head.meta ?? [], nodes };
}

const metaOf = (meta: Meta[], key: string) =>
  meta.find((m) => m.property === key || m.name === key)?.content;

/** `https://host/path.jpg?v=<hash>` where <hash> is the generated content hash. */
function expectContentHashed(url: string | undefined) {
  expect(url, "image url present").toBeTruthy();
  const value = url as string;
  expect(value.startsWith(`${SITE_URL}/`), `${value} is absolute`).toBe(true);
  const [path, query] = value.slice(SITE_URL.length).split("?");
  const hash = SOCIAL_IMAGE_HASHES[path];
  expect(hash, `${path} has a generated content hash`).toBeTruthy();
  expect(query).toBe(`v=${hash}`);
}

describe("Article JSON-LD image consistency", () => {
  it("the shared og-cover fallback is content-hashed", () => {
    expectContentHashed(SOCIAL_IMAGE_URL);
    expect(SOCIAL_IMAGE_URL).toBe(socialImageUrl("/og-cover.jpg"));
  });

  it.each(BLOG_POSTS.map((p) => p.slug))(
    "post %s uses one content-hashed image across Article JSON-LD, og:image and twitter:image",
    async (slug) => {
      const { meta, nodes } = await headFor("/src/routes/blog.$slug.tsx", { slug });
      const article = nodes.find((n) => n["@type"] === "BlogPosting");
      expect(article, "BlogPosting node emitted").toBeTruthy();

      const image = article!.image as { url?: string; width?: number; height?: number };
      expectContentHashed(image?.url);
      expect(image.width).toBe(1200);
      expect(image.height).toBe(630);

      // The head tags must point at the exact same URL (query string included).
      expect(metaOf(meta, "og:image")).toBe(image.url);
      expect(metaOf(meta, "og:image:secure_url")).toBe(image.url);
      expect(metaOf(meta, "twitter:image")).toBe(image.url);
      expect(metaOf(meta, "og:image:alt")).toBeTruthy();
      expect(metaOf(meta, "twitter:image:alt")).toBe(metaOf(meta, "og:image:alt"));

      // Posts without a dedicated cover fall back to the shared og-cover.
      const post = BLOG_POSTS.find((p) => p.slug === slug)!;
      expect(image.url).toBe(post.image ? socialImageUrl(post.image) : SOCIAL_IMAGE_URL);
    },
  );

  it("blog index BlogPosting nodes reuse the same image URLs as the post pages", async () => {
    const { nodes } = await headFor("/src/routes/blog.index.tsx", {});
    const indexPosts = nodes
      .flatMap((n) => (Array.isArray(n.blogPost) ? n.blogPost : []))
      .concat(nodes.filter((n) => n["@type"] === "BlogPosting")) as Record<string, unknown>[];
    expect(indexPosts.length).toBeGreaterThan(0);

    for (const node of indexPosts) {
      const url = (node.image as { url?: string })?.url;
      expectContentHashed(url);
      const slug = String(node["@id"]).split("/blog/")[1]?.split("#")[0];
      const { nodes: postNodes } = await headFor("/src/routes/blog.$slug.tsx", { slug });
      const article = postNodes.find((n) => n["@type"] === "BlogPosting") as Record<string, unknown>;
      expect(url).toBe((article.image as { url?: string }).url);
    }
  });
});
