#!/usr/bin/env node
/**
 * Generate the split sitemap set from the actual route files + dynamic content.
 *
 *   public/sitemap.xml         <sitemapindex> pointing at the three below
 *   public/sitemap-pages.xml   marketing / app / legal routes
 *   public/sitemap-blog.xml    /blog + every journal post
 *   public/sitemap-assets.xml  every demo token detail page
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
import { SITEMAP_PARTS, SITEMAP_INDEX_FILE } from "./sitemap-parts.mjs";

const ROOT = process.cwd();
const ROUTES_DIR = resolve(ROOT, "src/routes");
const BASE_URL = "https://www.getpumppilot.app";

/**
 * Routes that must never be advertised to crawlers.
 * Wallet-gated app surfaces come from src/lib/indexing-policy.ts so the
 * sitemap and the per-route `noindex` meta can never drift apart.
 */
const policySrc = await readFile(resolve(ROOT, "src/lib/indexing-policy.ts"), "utf8");
const policyPaths = (name) => {
  const block = policySrc.split(`export const ${name}`)[1]?.split("] as const")[0] ?? "";
  return [...block.matchAll(/"(\/[^"]*)"/g)].map((m) => m[1]);
};
const EXCLUDE = new Set([
  ...policyPaths("WALLET_GATED_ROUTES"),
  ...policyPaths("INTERNAL_ROUTES"),
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
  /**
 * Section split. Each family gets its own <urlset> file; the index lists them
 * all. `lastmod` stays authoritative: a URL only carries one when the content
 * itself has a page-specific timestamp (journal `updated ?? date`), and a
 * section's index `lastmod` is the newest `lastmod` among its own URLs —
 * never build time, never "today".
 */
const sections = {
  pages: (await staticRoutes())
    .filter((path) => !path.startsWith("/blog") && !path.startsWith("/asset/"))
    .map((path) => ({ path })),
  blog: [
    ...(await staticRoutes()).filter((p) => p === "/blog").map((path) => ({ path })),
    ...(await blogEntries()),
  ],
  assets: await assetEntries(),
};

// The /blog index has no timestamp of its own; the freshest post it lists is
// the authoritative "last changed" signal for that page.
const newestBlogLastmod = sections.blog
  .map((e) => e.lastmod)
  .filter(Boolean)
  .sort()
  .pop();
for (const e of sections.blog) {
  if (e.path === "/blog" && newestBlogLastmod) e.lastmod = newestBlogLastmod;
}

function urlsetXml(entries, seen) {
  const urls = [];
  for (const e of entries) {
    if (seen.has(e.path)) continue;
    seen.add(e.path);
    const loc = `${BASE_URL}${e.path === "/" ? "/" : e.path}`;
    urls.push(
      `  <url><loc>${loc}</loc>${e.lastmod ? `<lastmod>${e.lastmod}</lastmod>` : ""}${e.changefreq ? `<changefreq>${e.changefreq}</changefreq>` : ""}<priority>${priorityFor(e.path)}</priority></url>`,
    );
  }
  const xml =
    [
      `<?xml version="1.0" encoding="UTF-8"?>`,
      `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
      ...urls,
      `</urlset>`,
    ].join("\n") + "\n";
  const lastmod = entries
    .map((e) => e.lastmod)
    .filter(Boolean)
    .sort()
    .pop();
  return { xml, count: urls.length, lastmod };
}

const seen = new Set();
const files = [];
let total = 0;
const indexRows = [];
for (const { id, file } of SITEMAP_PARTS) {
  const { xml, count, lastmod } = urlsetXml(sections[id] ?? [], seen);
  if (count === 0) {
    console.error(`sitemap: section "${id}" produced no URLs`);
    process.exit(1);
  }
  total += count;
  files.push({ file, xml, count });
  indexRows.push(
    `  <sitemap><loc>${BASE_URL}/${file}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ""}</sitemap>`,
  );
}

files.push({
  file: SITEMAP_INDEX_FILE,
  count: files.length,
  xml:
    [
      `<?xml version="1.0" encoding="UTF-8"?>`,
      `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
      ...indexRows,
      `</sitemapindex>`,
    ].join("\n") + "\n",
});

let stale = [];
for (const { file, xml } of files) {
  const path = resolve(ROOT, "public", file);
  const current = await readFile(path, "utf8").catch(() => "");
  if (current === xml) continue;
  stale.push(file);
  if (!process.argv.includes("--check")) await writeFile(path, xml);
}

if (stale.length === 0) {
  console.log(`sitemap: up to date (${total} urls across ${SITEMAP_PARTS.length} sitemaps)`);
} else if (process.argv.includes("--check")) {
  console.error(`sitemap: out of date (${stale.join(", ")}) — run \`node scripts/gen-sitemap.mjs\``);
  process.exit(1);
} else {
  console.log(
    `sitemap: wrote ${total} urls to ${SITEMAP_PARTS.map((p) => p.file).join(", ")} + ${SITEMAP_INDEX_FILE}`,
  );
}
