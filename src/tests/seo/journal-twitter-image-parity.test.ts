import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";

import { BLOG_POSTS } from "@/lib/blog-posts";

/**
 * Journal Twitter card <-> Article JSON-LD image parity guard.
 *
 * X/Twitter and Google read the share image from two independent places:
 * the `twitter:image` meta tag and the Article/BlogPosting `image` node.
 * When they disagree the crawler shows one image and the rich result shows
 * another. This renders the real SSR HTML for every journal route and asserts:
 *
 *   - `twitter:card` is `summary_large_image` everywhere (wide article cards)
 *   - `twitter:image` === `og:image` === the page's Article JSON-LD `image`
 *   - the same post's nested node on /blog carries the identical image URL
 *   - the /blog index's own card image matches the Blog node's `image`
 *   - every image URL is absolute https
 */

const BASE_URL = (process.env.SEO_E2E_BASE_URL ?? "http://localhost:8080").replace(/\/$/, "");

const ARTICLE_TYPES = new Set(["Article", "BlogPosting", "NewsArticle", "TechArticle"]);
const EXPECTED_CARD = "summary_large_image";

type Node = Record<string, unknown>;

function decodeEntities(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, "\u00a0");
}

function metaContent(html: string, key: string) {
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const matcher = new RegExp(`(property|name)\\s*=\\s*["']${key}["']`, "i");
    if (!matcher.test(tag)) continue;
    const content = /content\s*=\s*["']([\s\S]*?)["']/i.exec(tag)?.[1];
    if (content != null) return decodeEntities(content.trim());
  }
  return "";
}

function jsonLdNodes(html: string): Node[] {
  const blocks = [
    ...html.matchAll(
      /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
    ),
  ];
  const nodes: Node[] = [];
  const push = (entry: Node) => {
    nodes.push(entry);
    const nested = entry.blogPost;
    if (Array.isArray(nested)) nodes.push(...(nested as Node[]));
  };
  for (const [, raw] of blocks) {
    const parsed = JSON.parse(decodeEntities(raw.trim())) as Node | Node[];
    for (const entry of Array.isArray(parsed) ? parsed : [parsed]) {
      const graph = entry["@graph"];
      if (Array.isArray(graph)) (graph as Node[]).forEach(push);
      else push(entry);
    }
  }
  return nodes;
}

function typesOf(node: Node): string[] {
  const t = node["@type"];
  return Array.isArray(t) ? (t as string[]) : typeof t === "string" ? [t] : [];
}

const isArticle = (n: Node) => typesOf(n).some((t) => ARTICLE_TYPES.has(t));

/** Accepts a string, an ImageObject, or an array of either. */
function imageUrlOf(image: unknown): string {
  if (typeof image === "string") return image;
  if (Array.isArray(image)) return imageUrlOf(image[0]);
  if (image && typeof image === "object") {
    const url = (image as Node).url ?? (image as Node)["contentUrl"];
    if (typeof url === "string") return url;
  }
  return "";
}

async function ping(url: string) {
  try {
    const res = await fetch(url, { headers: { accept: "text/html" } });
    return res.ok || res.status === 404;
  } catch {
    return false;
  }
}

let server: ChildProcess | null = null;
let base = BASE_URL;
const pages = new Map<string, string>();

beforeAll(async () => {
  if (!(await ping(base))) {
    const port = 43131;
    base = `http://localhost:${port}`;
    server = spawn("npx", ["vite", "dev", "--port", String(port), "--host", "127.0.0.1"], {
      stdio: "ignore",
      env: process.env,
    });
    const deadline = Date.now() + 90_000;
    while (Date.now() < deadline) {
      if (await ping(base)) break;
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  expect(await ping(base), `no SSR server reachable at ${base}`).toBe(true);

  for (const path of ["/blog", ...BLOG_POSTS.map((p) => `/blog/${p.slug}`)]) {
    const res = await fetch(`${base}${path}`, { headers: { accept: "text/html" } });
    expect(res.status, `GET ${path}`).toBe(200);
    pages.set(path, await res.text());
  }
}, 180_000);

afterAll(() => {
  server?.kill("SIGTERM");
});

describe("journal twitter card / Article JSON-LD image parity", () => {
  it("covers every journal route", () => {
    expect(BLOG_POSTS.length).toBeGreaterThan(0);
    expect(pages.size).toBe(BLOG_POSTS.length + 1);
  });

  for (const post of BLOG_POSTS) {
    const path = `/blog/${post.slug}`;

    describe(path, () => {
      const read = () => {
        const html = pages.get(path)!;
        const found = jsonLdNodes(html).filter(isArticle);
        expect(found.length, `${path} emits exactly one Article node`).toBe(1);
        return { html, node: found[0] };
      };

      it(`declares twitter:card "${EXPECTED_CARD}"`, () => {
        expect(metaContent(read().html, "twitter:card")).toBe(EXPECTED_CARD);
      });

      it("twitter:image matches the Article JSON-LD image", () => {
        const { html, node } = read();
        const ld = imageUrlOf(node.image);
        expect(ld, "Article node must declare an image URL").toMatch(/^https:\/\//);
        expect(metaContent(html, "twitter:image"), "twitter:image must equal the JSON-LD image").toBe(ld);
      });

      it("og:image matches the Article JSON-LD image", () => {
        const { html, node } = read();
        expect(metaContent(html, "og:image")).toBe(imageUrlOf(node.image));
      });

      it("image alt text is consistent across both card formats", () => {
        const { html, node } = read();
        const caption =
          node.image && typeof node.image === "object"
            ? ((node.image as Node).caption as string | undefined)
            : undefined;
        const twitterAlt = metaContent(html, "twitter:image:alt");
        expect(twitterAlt.length).toBeGreaterThan(0);
        expect(metaContent(html, "og:image:alt")).toBe(twitterAlt);
        if (caption) expect(caption).toBe(twitterAlt);
      });

      it("the /blog index nests the same image URL for this post", () => {
        const { node } = read();
        const indexNode = jsonLdNodes(pages.get("/blog")!)
          .filter(isArticle)
          .find((n) => String(n["@id"] ?? "").includes(`/blog/${post.slug}`));
        expect(indexNode, `/blog must list ${post.slug}`).toBeDefined();
        expect(imageUrlOf(indexNode!.image)).toBe(imageUrlOf(node.image));
      });
    });
  }

  describe("/blog", () => {
    it(`declares twitter:card "${EXPECTED_CARD}"`, () => {
      expect(metaContent(pages.get("/blog")!, "twitter:card")).toBe(EXPECTED_CARD);
    });

    it("its own twitter:image / og:image match the Blog node image", () => {
      const html = pages.get("/blog")!;
      const blog = jsonLdNodes(html).find((n) => typesOf(n).includes("Blog"));
      expect(blog, "/blog must emit a Blog node").toBeDefined();
      const ld = imageUrlOf(blog!.image);
      expect(ld).toMatch(/^https:\/\//);
      expect(metaContent(html, "twitter:image")).toBe(ld);
      expect(metaContent(html, "og:image")).toBe(ld);
    });
  });
});
