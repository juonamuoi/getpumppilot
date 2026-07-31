/**
 * Pagination helpers for indexable listing pages (currently the journal/blog
 * index).
 *
 * SEO contract for a paginated series — one page of the series per URL:
 *
 *   /blog          page 1 (canonical has no ?page — page 1 is the bare URL)
 *   /blog?page=2   page 2 …
 *
 *   • each page self-canonicalises (never to page 1 — that would de-index
 *     posts that only appear on later pages)
 *   • `<link rel="prev">` / `<link rel="next">` chain the series so crawlers
 *     discover page N+1 and understand the sequence
 *   • matching JSON-LD: a `CollectionPage` carrying the same
 *     `previousItem`/`nextItem` chain plus an `ItemList` of exactly the
 *     entries rendered on that page
 */
import { canonicalUrl, hreflangLinks } from "./structured-data";

/** Entries per listing page. */
export const PAGE_SIZE = 6;

export type Paged<T> = {
  page: number;
  totalPages: number;
  totalItems: number;
  items: T[];
  /** 1-based index of the first item on this page (for ItemList positions). */
  startIndex: number;
  hasPrev: boolean;
  hasNext: boolean;
};

/** Clamp any user-supplied page value into the real range. */
export function normalizePage(raw: unknown, totalPages: number) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return 1;
  return Math.min(Math.max(Math.trunc(n), 1), Math.max(totalPages, 1));
}

export function paginate<T>(items: readonly T[], rawPage: unknown, pageSize = PAGE_SIZE): Paged<T> {
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const page = normalizePage(rawPage, totalPages);
  const start = (page - 1) * pageSize;
  return {
    page,
    totalPages,
    totalItems: items.length,
    items: items.slice(start, start + pageSize),
    startIndex: start + 1,
    hasPrev: page > 1,
    hasNext: page < totalPages,
  };
}

/**
 * Path for a page of the series. Page 1 is always the bare path so the series
 * has exactly one entry URL and `?page=1` never becomes a duplicate.
 */
export function pagePath(basePath: string, page: number) {
  return page <= 1 ? basePath : `${basePath}?page=${page}`;
}

export const pageUrl = (basePath: string, page: number) => canonicalUrl(pagePath(basePath, page));

/**
 * `<link>` set for a paginated page: self-canonical, hreflang alternates for
 * that same URL, and the prev/next chain when those pages exist.
 */
export function paginationLinks(basePath: string, paged: Pick<Paged<unknown>, "page" | "totalPages">) {
  const self = pagePath(basePath, paged.page);
  const links: Array<{ rel: string; href: string; hreflang?: string }> = [
    { rel: "canonical", href: canonicalUrl(self) },
    ...hreflangLinks(self),
  ];
  if (paged.page > 1) links.push({ rel: "prev", href: pageUrl(basePath, paged.page - 1) });
  if (paged.page < paged.totalPages) links.push({ rel: "next", href: pageUrl(basePath, paged.page + 1) });
  return links;
}

/** Page-aware title/description suffix so paginated pages aren't duplicates. */
export function paginationTitleSuffix(paged: Pick<Paged<unknown>, "page" | "totalPages">) {
  return paged.page > 1 ? ` — Page ${paged.page} of ${paged.totalPages}` : "";
}

/**
 * `CollectionPage` node mirroring the rel=prev/next chain, with an `ItemList`
 * of just this page's entries (positions continue across pages).
 */
export function collectionPageSchema(opts: {
  basePath: string;
  paged: Paged<unknown>;
  id: string;
  name: string;
  description: string;
  /** Absolute URLs of the entries rendered on this page, in render order. */
  itemUrls: string[];
  isPartOf?: string;
  publisher?: string;
}) {
  const { basePath, paged, itemUrls } = opts;
  const node: Record<string, unknown> = {
    "@type": "CollectionPage",
    "@id": opts.id,
    url: pageUrl(basePath, paged.page),
    name: opts.name + paginationTitleSuffix(paged),
    description: opts.description,
    inLanguage: "en",
    mainEntity: {
      "@type": "ItemList",
      name: opts.name,
      numberOfItems: itemUrls.length,
      itemListOrder: "https://schema.org/ItemListOrderDescending",
      itemListElement: itemUrls.map((url, i) => ({
        "@type": "ListItem",
        position: paged.startIndex + i,
        url,
      })),
    },
  };
  if (opts.isPartOf) node.isPartOf = { "@id": opts.isPartOf };
  if (opts.publisher) node.publisher = { "@id": opts.publisher };
  if (paged.hasPrev) node.previousItem = { "@id": pageUrl(basePath, paged.page - 1) };
  if (paged.hasNext) node.nextItem = { "@id": pageUrl(basePath, paged.page + 1) };
  return node;
}
