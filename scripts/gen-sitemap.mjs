#!/usr/bin/env node
/**
 * Generate public/sitemap.xml from the actual route files + dynamic content.
 *
 * Sources of truth:
 *  - src/routes/**.tsx  -> static, indexable page routes
 *  - src/lib/blog-posts.ts -> /blog/:slug
 *  - src/lib/mock-data.ts  -> /asset/:symbol
 *
 * <lastmod> policy: only emitted where an authoritative, page-specific
 * timestamp exists (blog `updated` ?? `date`). Never build time / "today".
 *
 * Run with --check to fail (exit 1) when public/sitemap.xml is out of date.
 */
import { readFile, writeFile, readdir } from "node:fs/promises";
import { resolve, join } from "node:path";

const ROOT = process.cwd();
const SITEMAP = resolve(ROOT, "public/sitemap.xml");
const ROUTES_DIR = resolve(ROOT, "src/routes");
const BASE_URL = "https://www.getpumppilot.app";

/** Routes that must never be advertised to crawlers. */
const EXCLUDE = new Set([
  "/doctor",
  "/login", // duplicate of /auth
]);

const PRIORITY = [
  [/^\/$/, "1.0"],
  [/^\/pricing$/, "0.9"],
  [/^\/blog$/, "0.9"],
  [/^\/blog\//, "0.8"],
  [/^\/(auth|developers|scanner)$/, "0.8"],
  [/^\/asset\//, "0.6"],
  [/^\/(terms|privacy|refund)$/, "0.3"],
  [/^\/risk-disclosure$/, "0.5"],
];

function priorityFor(path) {
  for (const [re, p] of PRIORITY) if (re.test(path)) return p;
  return "0.7";
}

async function walk(dir, prefix = "") {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const name = entry.name;
    if (name.startsWith("[") || name === "api") continue;
    if (entry.isDirectory()) {
      out.push(...(await walk(join(dir, name), `${prefix}${name}.`)));
    } else if (name.endsWith(".tsx")) {
      out.push({ file: join(dir, name), id: prefix + name.replace(/\.tsx$/, "") });
    }
  }
  return out;
}

function idToPath(id) {
  const parts = id.split(".").filter((s) => s !== "index" && !s.startsWith("_"));
  return "/" + parts.join("/");
}

async function staticRoutes() {
  const files = await walk(ROUTES_DIR);
  const paths = [];
  for (const { file, id } of files) {
    if (id === "__root") continue;
    if (id.includes("$")) continue; // dynamic — expanded from data below
    const src = await readFile(file, "utf8");
    if (/noindex/.test(src)) continue;
    const path = idToPath(id).replace(/\/$/, "") || "/";
    if (EXCLUDE.has(path)) continue;
    paths.push(path);
  }
  return [...new Set(paths)].sort((a, b) => (a === "/" ? -1 : b === "/" ? 1 : a.localeCompare(b)));
}

async function blogEntries() {
  const src = await readFile(resolve(ROOT, "src/lib/blog-posts.ts"), "utf8");
  const entries = [];
  for (const block of src.split(/\n\s*\{\s*\n/)) {
    const slug = block.match(/slug:\s*"([^"]+)"/)?.[1];
    if (!slug) continue;
    const date = block.match(/\n\s*date:\s*"(\d{4}-\d{2}-\d{2})"/)?.[1];
    const updated = block.match(/\n\s*updated:\s*"(\d{4}-\d{2}-\d{2})"/)?.[1];
    entries.push({ path: `/blog/${slug}`, lastmod: updated ?? date });
  }
  return entries;
}

async function assetEntries() {
  const src = await readFile(resolve(ROOT, "src/lib/mock-data.ts"), "utf8");
  const symbols = [...src.matchAll(/\n\s*symbol:\s*"([A-Z0-9]+)"/g)].map((m) => m[1]);
  return [...new Set(symbols)].map((s) => ({ path: `/asset/${s.toLowerCase()}` }));
}

const entries = [
  ...(await staticRoutes()).map((path) => ({ path })),
  ...(await blogEntries()),
  ...(await assetEntries()),
];

const seen = new Set();
const urls = [];
for (const e of entries) {
  if (seen.has(e.path)) continue;
  seen.add(e.path);
  const loc = `${BASE_URL}${e.path === "/" ? "/" : e.path}`;
  urls.push(
    `  <url><loc>${loc}</loc>${e.lastmod ? `<lastmod>${e.lastmod}</lastmod>` : ""}<priority>${priorityFor(e.path)}</priority></url>`,
  );
}

const xml =
  [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
    ...urls,
    `</urlset>`,
  ].join("\n") + "\n";

const current = await readFile(SITEMAP, "utf8").catch(() => "");
if (current === xml) {
  console.log(`sitemap: up to date (${urls.length} urls)`);
} else if (process.argv.includes("--check")) {
  console.error("sitemap: out of date — run `node scripts/gen-sitemap.mjs`");
  process.exit(1);
} else {
  await writeFile(SITEMAP, xml);
  console.log(`sitemap: wrote ${urls.length} urls to public/sitemap.xml`);
}
