import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";

import { BLOG_POSTS } from "@/lib/blog-posts";

/**
 * Journal Article date guard.
 *
 * Google uses `datePublished` / `dateModified` to rank freshness and to show
 * dates in results, and it distrusts structured data whose dates contradict
 * the page or the source of truth. For every journal post this renders the
 * real SSR HTML and asserts the BlogPosting node's dates are:
 *
 *   - valid ISO 8601 (date-only or full timestamp with an offset)
 *   - round-trippable (no "2026-02-31" style impossible dates)
 *   - equal to the post's authored `date` / `updated ?? date`
 *   - ordered: dateModified >= datePublished
 *   - not in the future
 *   - identical to the `article:published_time` / `article:modified_time`
 *     meta tags and to the same post's node on the /blog index
 */

const BASE_URL = (process.env.SEO_E2E_BASE_URL ?? "http://localhost:8080").replace(/\/$/, "");

const ARTICLE_TYPES = new Set(["Article", "BlogPosting", "NewsArticle", "TechArticle"]);

/** ISO 8601: `YYYY-MM-DD` or `YYYY-MM-DDThh:mm(:ss(.sss))` + `Z`/`±hh:mm`. */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_DATETIME =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/;

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

function metaProperty(html: string, property: string) {
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const prop = new RegExp(`(property|name)\\s*=\\s*["']${property}["']`, "i");
    if (!prop.test(tag)) continue;
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
    // Blog index nests each post inside the Blog node's `blogPost` array.
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

/** True only for a string that is valid ISO 8601 AND a real calendar date. */
function isIso8601(value: unknown): value is string {
  if (typeof value !== "string") return false;
  if (!ISO_DATE.test(value) && !ISO_DATETIME.test(value)) return false;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return false;
  // Round-trip the calendar part so 2026-02-31 (which Date rolls over) fails.
  return parsed.toISOString().slice(0, 10) === value.slice(0, 10);
}

const ms = (iso: string) => new Date(iso).getTime();

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
    const port = 43127;
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

  const paths = ["/blog", ...BLOG_POSTS.map((p) => `/blog/${p.slug}`)];
  for (const path of paths) {
    const res = await fetch(`${base}${path}`, { headers: { accept: "text/html" } });
    expect(res.status, `GET ${path}`).toBe(200);
    pages.set(path, await res.text());
  }
}, 180_000);

afterAll(() => {
  server?.kill("SIGTERM");
});

describe("journal Article JSON-LD dates", () => {
  it("covers every journal post", () => {
    expect(BLOG_POSTS.length).toBeGreaterThan(0);
    expect(pages.size).toBe(BLOG_POSTS.length + 1);
  });

  describe("authored source dates", () => {
    for (const post of BLOG_POSTS) {
      it(`${post.slug} declares ISO 8601 dates in blog-posts.ts`, () => {
        expect(isIso8601(post.date), `date "${post.date}" must be ISO 8601`).toBe(true);
        if (post.updated !== undefined) {
          expect(
            isIso8601(post.updated),
            `updated "${post.updated}" must be ISO 8601`,
          ).toBe(true);
          expect(
            ms(post.updated) >= ms(post.date),
            `updated (${post.updated}) must not precede date (${post.date})`,
          ).toBe(true);
        }
      });
    }
  });

  for (const post of BLOG_POSTS) {
    const path = `/blog/${post.slug}`;
    const expectedPublished = post.date;
    const expectedModified = post.updated ?? post.date;

    describe(path, () => {
      const article = () => {
        const html = pages.get(path)!;
        const found = jsonLdNodes(html).filter(isArticle);
        expect(found.length, `${path} emits exactly one Article node`).toBe(1);
        return { html, node: found[0] };
      };

      it("datePublished and dateModified are present and ISO 8601", () => {
        const { node } = article();
        expect(
          isIso8601(node.datePublished),
          `datePublished "${String(node.datePublished)}" must be ISO 8601`,
        ).toBe(true);
        expect(
          isIso8601(node.dateModified),
          `dateModified "${String(node.dateModified)}" must be ISO 8601`,
        ).toBe(true);
      });

      it("dates match the authored post metadata", () => {
        const { node } = article();
        expect(node.datePublished, "datePublished must match the post's date").toBe(
          expectedPublished,
        );
        expect(
          node.dateModified,
          "dateModified must match the post's `updated` (or `date` when absent)",
        ).toBe(expectedModified);
      });

      it("dateModified is not earlier than datePublished", () => {
        const { node } = article();
        const published = ms(node.datePublished as string);
        const modified = ms(node.dateModified as string);
        expect(
          modified >= published,
          `dateModified (${String(node.dateModified)}) precedes datePublished (${String(node.datePublished)})`,
        ).toBe(true);
      });

      it("dates are not in the future", () => {
        const { node } = article();
        // Allow one day of slack for date-only values in other timezones.
        const limit = Date.now() + 24 * 60 * 60 * 1000;
        expect(ms(node.datePublished as string) <= limit, "datePublished is in the future").toBe(true);
        expect(ms(node.dateModified as string) <= limit, "dateModified is in the future").toBe(true);
      });

      it("dates match the article:published_time / article:modified_time meta tags", () => {
        const { html, node } = article();
        const published = metaProperty(html, "article:published_time");
        const modified = metaProperty(html, "article:modified_time");
        expect(published, "article:published_time present").toBeTruthy();
        expect(modified, "article:modified_time present").toBeTruthy();
        expect(isIso8601(published), `article:published_time "${published}" must be ISO 8601`).toBe(true);
        expect(isIso8601(modified), `article:modified_time "${modified}" must be ISO 8601`).toBe(true);
        expect(published, "article:published_time must match JSON-LD datePublished").toBe(
          node.datePublished,
        );
        expect(modified, "article:modified_time must match JSON-LD dateModified").toBe(
          node.dateModified,
        );
      });

      it("dates match the same post's node on the /blog index", () => {
        const { node } = article();
        const indexNodes = jsonLdNodes(pages.get("/blog")!).filter(isArticle);
        const match = indexNodes.find((n) => String(n["@id"] ?? "").includes(`/blog/${post.slug}#`));
        expect(match, `/blog index lists ${post.slug}`).toBeTruthy();
        expect(match!.datePublished, "index datePublished drifted from the post page").toBe(
          node.datePublished,
        );
        expect(match!.dateModified, "index dateModified drifted from the post page").toBe(
          node.dateModified,
        );
      });
    });
  }
});
