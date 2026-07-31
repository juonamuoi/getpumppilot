/**
 * Paginated journal listing pages must be individually indexable:
 *
 *  - every page self-canonicalises (page 2 never canonicalises to page 1,
 *    which would drop the posts that only appear on later pages)
 *  - hreflang alternates follow the canonical of that same page
 *  - rel=prev/next chain the series in both directions, with no prev on the
 *    first page and no next on the last
 *  - the JSON-LD CollectionPage + pagination ItemList mirror those tags
 *    exactly, and list only the entries rendered on that page
 *  - the sitemap contains every page of the series
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { BLOG_POSTS } from "@/lib/blog-posts";
import { canonicalUrl } from "@/lib/structured-data";
import {
  PAGE_SIZE,
  paginate,
  pagePath,
  pageUrl,
  pageItemId,
  paginationLinks,
  collectionPageSchema,
  paginationChainSchema,
} from "@/lib/pagination";

const BASE = "/blog";
const TOTAL_PAGES = Math.max(1, Math.ceil(BLOG_POSTS.length / PAGE_SIZE));
const pages = Array.from({ length: TOTAL_PAGES }, (_, i) => i + 1);

const linksFor = (page: number) => paginationLinks(BASE, paginate(BLOG_POSTS, page));
const rel = (page: number, r: string) => linksFor(page).filter((l) => l.rel === r);

describe("paginated journal listing — rel links", () => {
  it("page 1 is the bare /blog URL (no ?page=1 duplicate)", () => {
    expect(pagePath(BASE, 1)).toBe("/blog");
    expect(pageUrl(BASE, 2)).toBe(`${canonicalUrl("/blog")}?page=2`);
  });

  it.each(pages)("page %i self-canonicalises", (page) => {
    const canonical = rel(page, "canonical");
    expect(canonical).toHaveLength(1);
    expect(canonical[0].href).toBe(pageUrl(BASE, page));
  });

  it.each(pages)("page %i hreflang alternates match its own canonical", (page) => {
    const alts = rel(page, "alternate");
    expect(alts.map((a) => a.hreflang).sort()).toEqual(["en", "x-default"]);
    for (const a of alts) expect(a.href).toBe(pageUrl(BASE, page));
  });

  it("first page has next but no prev; last page has prev but no next", () => {
    expect(rel(1, "prev")).toHaveLength(0);
    expect(rel(TOTAL_PAGES, "next")).toHaveLength(0);
    if (TOTAL_PAGES > 1) {
      expect(rel(1, "next")[0].href).toBe(pageUrl(BASE, 2));
      expect(rel(TOTAL_PAGES, "prev")[0].href).toBe(pageUrl(BASE, TOTAL_PAGES - 1));
    }
  });

  it("the prev/next chain is symmetric across the whole series", () => {
    for (const page of pages.slice(0, -1)) {
      expect(rel(page, "next")[0].href).toBe(pageUrl(BASE, page + 1));
      expect(rel(page + 1, "prev")[0].href).toBe(pageUrl(BASE, page));
    }
  });
});

describe("paginated journal listing — JSON-LD parity", () => {
  const graphFor = (page: number) => {
    const paged = paginate(BLOG_POSTS, page);
    const itemUrls = paged.items.map((p) => canonicalUrl(`/blog/${p.slug}`));
    return {
      paged,
      itemUrls,
      collection: collectionPageSchema({
        basePath: BASE,
        paged,
        id: `${pageUrl(BASE, page)}#webpage`,
        name: "PumpPilot AI Blog",
        description: "AI investment and crypto trading guides.",
        itemUrls,
      }) as Record<string, any>,
      chain: paginationChainSchema(BASE, paged, "PumpPilot AI Blog"),
    };
  };

  it.each(pages)("page %i CollectionPage url matches its canonical", (page) => {
    const { collection } = graphFor(page);
    expect(collection.url).toBe(rel(page, "canonical")[0].href);
    expect(collection["@id"]).toBe(`${pageUrl(BASE, page)}#webpage`);
  });

  it.each(pages)("page %i ItemList holds exactly the rendered entries", (page) => {
    const { collection, itemUrls, paged } = graphFor(page);
    const list = collection.mainEntity as any;
    expect(list.itemListElement.map((i: any) => i.url)).toEqual(itemUrls);
    // Positions continue across pages rather than restarting at 1.
    expect(list.itemListElement[0].position).toBe(paged.startIndex);
  });

  it.each(pages)("page %i pagination ItemList mirrors the rel=prev/next tags", (page) => {
    const { chain } = graphFor(page);
    expect(chain.numberOfItems).toBe(TOTAL_PAGES);
    const items = chain.itemListElement as any[];
    expect(items.map((i) => i.url)).toEqual(pages.map((p) => pageUrl(BASE, p)));

    const self = items.find((i) => i["@id"] === pageItemId(BASE, page))!;
    const prevTag = rel(page, "prev")[0];
    const nextTag = rel(page, "next")[0];
    expect(self.previousItem?.["@id"]).toBe(prevTag ? pageItemId(BASE, page - 1) : undefined);
    expect(self.nextItem?.["@id"]).toBe(nextTag ? pageItemId(BASE, page + 1) : undefined);
  });

  it("every post appears on exactly one page of the series", () => {
    const seen = pages.flatMap((p) => paginate(BLOG_POSTS, p).items.map((i) => i.slug));
    expect(seen.sort()).toEqual(BLOG_POSTS.map((p) => p.slug).sort());
  });
});

describe("paginated journal listing — sitemap coverage", () => {
  const xml = readFileSync(resolve(process.cwd(), "public/sitemap-blog.xml"), "utf8");

  it.each(pages)("sitemap lists page %i", (page) => {
    expect(xml).toContain(`<loc>${pageUrl(BASE, page)}</loc>`);
  });
});
