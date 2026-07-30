#!/usr/bin/env node
/**
 * Refresh <lastmod> values in public/sitemap.xml after each build.
 *
 * Policy: <lastmod> is only emitted when we have an authoritative,
 * page-specific timestamp for a real content change. Today the only such
 * source in this project is the blog post metadata in src/lib/blog-posts.ts
 * (`updated` falling back to `date`). Every other URL intentionally gets NO
 * <lastmod> — a build-time or "today" fallback would be a lie to crawlers and
 * gets stripped if present.
 *
 * Run with --check to fail (exit 1) when the file is out of date.
 */
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const SITEMAP = resolve(process.cwd(), "public/sitemap.xml");
const POSTS = resolve(process.cwd(), "src/lib/blog-posts.ts");

/** slug -> ISO date (YYYY-MM-DD) from the blog post metadata. */
async function blogLastmods() {
  const src = await readFile(POSTS, "utf8");
  const map = new Map();
  const blocks = src.split(/\n\s*\{\s*\n/);
  for (const block of blocks) {
    const slug = block.match(/slug:\s*"([^"]+)"/)?.[1];
    if (!slug) continue;
    const date = block.match(/\n\s*date:\s*"(\d{4}-\d{2}-\d{2})"/)?.[1];
    const updated = block.match(/\n\s*updated:\s*"(\d{4}-\d{2}-\d{2})"/)?.[1];
    const lastmod = updated ?? date;
    if (lastmod) map.set(`/blog/${slug}`, lastmod);
  }
  return map;
}

function pathOf(loc) {
  try {
    return new URL(loc).pathname.replace(/\/$/, "") || "/";
  } catch {
    return loc;
  }
}

function rewrite(xml, lastmods) {
  return xml.replace(/<url>[\s\S]*?<\/url>/g, (url) => {
    const loc = url.match(/<loc>([^<]+)<\/loc>/)?.[1];
    if (!loc) return url;
    // Always strip existing lastmod first so stale/derived values can't linger.
    let next = url.replace(/\s*<lastmod>[^<]*<\/lastmod>/g, "");
    const lastmod = lastmods.get(pathOf(loc));
    if (lastmod) {
      next = next.replace(
        /(<loc>[^<]+<\/loc>)/,
        `$1<lastmod>${lastmod}</lastmod>`,
      );
    }
    return next;
  });
}

const check = process.argv.includes("--check");
const xml = await readFile(SITEMAP, "utf8");
const next = rewrite(xml, await blogLastmods());

if (next === xml) {
  console.log("sitemap lastmod: up to date");
} else if (check) {
  console.error("sitemap lastmod: out of date — run `bun run gen:sitemap`");
  process.exit(1);
} else {
  await writeFile(SITEMAP, next);
  console.log("sitemap lastmod: updated public/sitemap.xml");
}
