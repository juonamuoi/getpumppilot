/**
 * Shared definition of the split sitemap set.
 *
 * public/sitemap.xml is a <sitemapindex> that points at one <urlset> per
 * content family, so a change to a blog post never rewrites the asset or app
 * sitemap (and crawlers can re-fetch only the part that moved):
 *
 *   sitemap.xml          -> index
 *   sitemap-pages.xml    -> marketing / app / legal routes
 *   sitemap-blog.xml     -> /blog and every journal post
 *   sitemap-assets.xml   -> every demo token detail page
 *
 * Every consumer (robots validation, rich-results gate, SEO tests) reads the
 * URL set through `readSitemapUrlsXml()` so none of them has to know whether
 * the URLs live in one file or four.
 */
import { readFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export const BASE_URL = "https://www.getpumppilot.app";

/** Section id -> public filename. Order is the order in the index. */
export const SITEMAP_PARTS = [
  { id: "pages", file: "sitemap-pages.xml" },
  { id: "blog", file: "sitemap-blog.xml" },
  { id: "assets", file: "sitemap-assets.xml" },
];

export const SITEMAP_INDEX_FILE = "sitemap.xml";

const partPath = (root, file) => resolve(root, "public", file);

/** Concatenated XML of every child <urlset>, for `<loc>` scraping. */
export async function readSitemapUrlsXml(root = process.cwd()) {
  const parts = [];
  for (const { file } of SITEMAP_PARTS) {
    const xml = await readFile(partPath(root, file), "utf8").catch(() => "");
    if (xml) parts.push(xml);
  }
  // Fallback for a pre-split checkout: sitemap.xml still holds the URLs.
  if (parts.length === 0) {
    const xml = await readFile(partPath(root, SITEMAP_INDEX_FILE), "utf8").catch(() => "");
    if (xml && !xml.includes("<sitemapindex")) parts.push(xml);
  }
  return parts.join("\n");
}

/** Sync variant for vitest suites that read at module scope. */
export function readSitemapUrlsXmlSync(root = process.cwd()) {
  const parts = [];
  for (const { file } of SITEMAP_PARTS) {
    try {
      parts.push(readFileSync(partPath(root, file), "utf8"));
    } catch {
      /* part not generated yet */
    }
  }
  if (parts.length === 0) {
    const xml = readFileSync(partPath(root, SITEMAP_INDEX_FILE), "utf8");
    if (!xml.includes("<sitemapindex")) parts.push(xml);
  }
  return parts.join("\n");
}

export const parseLocs = (xml) => [...xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/g)].map((m) => m[1]);
