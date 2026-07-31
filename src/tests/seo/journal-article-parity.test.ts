import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";

import { BLOG_POSTS } from "@/lib/blog-posts";

/**
 * Journal Article JSON-LD ↔ rendered HTML parity guard.
 *
 * Google treats structured data that contradicts the visible page as
 * untrustworthy. For every journal post this renders the real SSR HTML and
 * asserts the Article/BlogPosting node's `headline`, `description` and
 * canonical URL (`url` / `mainEntityOfPage`) EXACTLY match the rendered
 * <title>, <meta name="description"> and <link rel="canonical">.
 */

const BASE_URL = (process.env.SEO_E2E_BASE_URL ?? "http://localhost:8080").replace(/\/$/, "");

const ARTICLE_TYPES = new Set([
  "Article",
  "BlogPosting",
  "NewsArticle",
  "TechArticle",
]);

type Node = Record<string, unknown>;

function decodeEntities(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, "\u00a0");
}

function renderedTitle(html: string) {
  const m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  return m ? decodeEntities(m[1].trim()) : "";
}

function metaDescription(html: string) {
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const name = /name\s*=\s*["']description["']/i.test(tag);
    if (!name) continue;
    const content = /content\s*=\s*["']([\s\S]*?)["']/i.exec(tag)?.[1];
    if (content != null) return decodeEntities(content.trim());
  }
  return "";
}

function canonicalHref(html: string) {
  for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
    if (!/rel\s*=\s*["']canonical["']/i.test(tag)) continue;
    const href = /href\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1];
    if (href) return decodeEntities(href.trim());
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
  for (const [, raw] of blocks) {
    const parsed = JSON.parse(decodeEntities(raw.trim())) as Node | Node[];
    const list = Array.isArray(parsed) ? parsed : [parsed];
    for (const entry of list) {
      const graph = entry["@graph"];
      if (Array.isArray(graph)) nodes.push(...(graph as Node[]));
      else nodes.push(entry);
    }
  }
  return nodes;
}

function typesOf(node: Node): string[] {
  const t = node["@type"];
  return Array.isArray(t) ? (t as string[]) : typeof t === "string" ? [t] : [];
}

/** `mainEntityOfPage` may be a bare URL string, `{ "@id": url }` or a WebPage. */
function urlRef(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const id = (value as Node)["@id"];
    if (typeof id === "string") return id;
  }
  return undefined;
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
    const port = 43121;
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

  for (const post of BLOG_POSTS) {
    const path = `/blog/${post.slug}`;
    const res = await fetch(`${base}${path}`, { headers: { accept: "text/html" } });
    expect(res.status, `GET ${path}`).toBe(200);
    pages.set(path, await res.text());
  }
}, 180_000);

afterAll(() => {
  server?.kill("SIGTERM");
});

describe("journal Article JSON-LD matches the rendered HTML", () => {
  it("covers every journal post", () => {
    expect(BLOG_POSTS.length).toBeGreaterThan(0);
    expect(pages.size).toBe(BLOG_POSTS.length);
  });

  for (const post of BLOG_POSTS) {
    const path = `/blog/${post.slug}`;

    describe(path, () => {
      const article = () => {
        const html = pages.get(path)!;
        const nodes = jsonLdNodes(html);
        const found = nodes.filter((n) => typesOf(n).some((t) => ARTICLE_TYPES.has(t)));
        expect(found.length, `${path} emits exactly one Article node`).toBe(1);
        return { html, node: found[0] };
      };

      it("headline equals the rendered <title>", () => {
        const { html, node } = article();
        const headline = node.headline as string;
        const title = renderedTitle(html);
        expect(headline, "headline present").toBeTruthy();
        expect(title, "<title> present").toBeTruthy();
        expect(
          headline,
          `JSON-LD headline "${headline}" must match <title> "${title}"`,
        ).toBe(title);
      });

      it("description equals <meta name=\"description\">", () => {
        const { html, node } = article();
        const description = node.description as string;
        const meta = metaDescription(html);
        expect(description, "JSON-LD description present").toBeTruthy();
        expect(meta, "meta description present").toBeTruthy();
        expect(
          description,
          `JSON-LD description must match the meta description on ${path}`,
        ).toBe(meta);
      });

      it("url and mainEntityOfPage equal <link rel=\"canonical\">", () => {
        const { html, node } = article();
        const canonical = canonicalHref(html);
        expect(canonical, "canonical link present").toBeTruthy();
        expect(canonical.endsWith(path), `canonical self-references ${path}`).toBe(true);

        const url = urlRef(node.url) ?? urlRef(node["@id"]);
        expect(url, `Article url must equal canonical ${canonical}`).toBe(canonical);

        const mainEntity = urlRef(node.mainEntityOfPage);
        expect(mainEntity, "mainEntityOfPage present").toBeTruthy();
        expect(
          mainEntity,
          `mainEntityOfPage must equal canonical ${canonical}`,
        ).toBe(canonical);
      });
    });
  }
});
