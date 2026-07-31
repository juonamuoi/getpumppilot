#!/usr/bin/env bun
/**
 * OG / Twitter image reachability gate for asset + token detail pages.
 *
 * For every `/asset/<symbol>` route (sourced from public/sitemap.xml, falling
 * back to the ASSETS list in src/lib/mock-data.ts) this renders the page,
 * extracts every social image URL it declares:
 *
 *   og:image, og:image:url, og:image:secure_url, twitter:image,
 *   twitter:image:src
 *
 * ...then fetches each one and fails when it:
 *   - returns a non-200 status,
 *   - redirects unexpectedly (any redirect that is not an allowed
 *     same-origin http -> https upgrade),
 *   - is not an image (missing / non-image content-type),
 *   - is empty (zero content-length).
 *
 * Because the tags carry the production origin, the checker rewrites that
 * origin onto whatever target it is verifying (local SSR server or build
 * output) unless --remote is passed.
 *
 * Usage:
 *   bun scripts/og-image-check.mjs [--server http://localhost:8080]
 *                                  [--dir dist] [--remote] [--json]
 *                                  [--out file.json]
 *
 * Exit 1 on any failure.
 */
import { readFile, readdir, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

const CANONICAL_ORIGIN = "https://www.getpumppilot.app";
const ALLOWED_REDIRECT_HOPS = 1;

const args = process.argv.slice(2);
const flag = (name, fallback = null) => {
  const i = args.indexOf(name);
  return i !== -1 ? (args[i + 1] ?? fallback) : fallback;
};
const SERVER = flag("--server", process.env.OG_CHECK_SERVER ?? null);
const DIR = flag("--dir");
const OUT = flag("--out");
const REMOTE = args.includes("--remote");
const AS_JSON = args.includes("--json");

/** Origin the fetched image URLs are rewritten to (null = leave as declared). */
const TARGET_ORIGIN = REMOTE ? null : (SERVER ?? "http://localhost:8080");

/* ------------------------------------------------------------------ routes */

async function assetPathsFromSitemap() {
  try {
    const xml = await readFile("public/sitemap.xml", "utf8");
    const locs = [...xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/g)].map((m) => m[1]);
    return locs
      .map((loc) => {
        try {
          return new URL(loc).pathname;
        } catch {
          return loc.startsWith("/") ? loc : `/${loc}`;
        }
      })
      .filter((p) => p.startsWith("/asset/"));
  } catch {
    return [];
  }
}

async function assetPathsFromMockData() {
  try {
    const src = await readFile("src/lib/mock-data.ts", "utf8");
    const symbols = [...src.matchAll(/symbol:\s*["'`]([A-Za-z0-9]+)["'`]/g)].map((m) => m[1]);
    return [...new Set(symbols)].map((s) => `/asset/${s.toLowerCase()}`);
  } catch {
    return [];
  }
}

async function resolveAssetPaths() {
  const fromSitemap = await assetPathsFromSitemap();
  const fromMock = await assetPathsFromMockData();
  const all = [...new Set([...fromSitemap, ...fromMock])].sort();
  return all;
}

/* -------------------------------------------------------------------- html */

async function walkHtml(dir, out = []) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "_build") continue;
      await walkHtml(full, out);
    } else if (entry.name.endsWith(".html")) {
      out.push(full);
    }
  }
  return out;
}

async function loadHtmlForPath(routePath) {
  if (DIR) {
    const candidates = [
      path.join(DIR, routePath.replace(/^\//, ""), "index.html"),
      path.join(DIR, `${routePath.replace(/^\//, "")}.html`),
    ];
    for (const c of candidates) {
      if (existsSync(c)) return await readFile(c, "utf8");
    }
    return null;
  }
  const base = SERVER ?? "http://localhost:8080";
  const res = await fetch(new URL(routePath, base), { redirect: "manual" });
  if (res.status !== 200) {
    throw new Error(`route ${routePath} returned ${res.status}`);
  }
  return await res.text();
}

const IMAGE_TAGS = [
  ["property", "og:image"],
  ["property", "og:image:url"],
  ["property", "og:image:secure_url"],
  ["name", "twitter:image"],
  ["name", "twitter:image:src"],
];

function extractImageUrls(html) {
  const found = [];
  const metaRe = /<meta\b[^>]*>/gi;
  for (const match of html.match(metaRe) ?? []) {
    const attr = (name) => {
      const m = match.match(new RegExp(`${name}\\s*=\\s*["']([^"']+)["']`, "i"));
      return m ? m[1] : null;
    };
    const content = attr("content");
    if (!content) continue;
    for (const [kind, key] of IMAGE_TAGS) {
      if (attr(kind)?.toLowerCase() === key) {
        found.push({ tag: key, url: decodeEntities(content) });
      }
    }
  }
  return found;
}

function decodeEntities(value) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

/* ------------------------------------------------------------------- fetch */

function rewriteOrigin(url) {
  if (!TARGET_ORIGIN) return url;
  if (url.startsWith("/")) return new URL(url, TARGET_ORIGIN).toString();
  try {
    const parsed = new URL(url);
    if (parsed.origin === CANONICAL_ORIGIN) {
      return new URL(parsed.pathname + parsed.search, TARGET_ORIGIN).toString();
    }
    return url;
  } catch {
    return url;
  }
}

function isAllowedRedirect(from, to) {
  try {
    const a = new URL(from);
    const b = new URL(to, from);
    // Only an http -> https upgrade on the same host+path is "expected".
    return (
      a.protocol === "http:" &&
      b.protocol === "https:" &&
      a.host === b.host &&
      a.pathname === b.pathname
    );
  } catch {
    return false;
  }
}

/** Follows redirects manually so unexpected hops are reported, not hidden. */
async function probeImage(rawUrl) {
  const target = rewriteOrigin(rawUrl);
  if (!/^https?:\/\//i.test(target)) {
    return { ok: false, code: "image_url_not_absolute", url: target, status: null, chain: [] };
  }
  const chain = [];
  let current = target;

  for (let hop = 0; hop <= ALLOWED_REDIRECT_HOPS + 1; hop++) {
    let res;
    try {
      res = await fetch(current, { redirect: "manual", headers: { accept: "image/*,*/*" } });
    } catch (err) {
      return {
        ok: false,
        code: "image_unreachable",
        url: current,
        status: null,
        chain,
        detail: String(err?.message ?? err),
      };
    }

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) {
        return { ok: false, code: "image_redirect_no_location", url: current, status: res.status, chain };
      }
      const next = new URL(location, current).toString();
      chain.push({ from: current, to: next, status: res.status });
      if (!isAllowedRedirect(current, next)) {
        return { ok: false, code: "image_unexpected_redirect", url: current, status: res.status, chain };
      }
      current = next;
      continue;
    }

    if (res.status !== 200) {
      return { ok: false, code: "image_bad_status", url: current, status: res.status, chain };
    }

    const type = res.headers.get("content-type") ?? "";
    if (!type.toLowerCase().startsWith("image/")) {
      return { ok: false, code: "image_not_an_image", url: current, status: 200, chain, detail: type || "(no content-type)" };
    }

    const length = Number(res.headers.get("content-length") ?? NaN);
    let bytes = Number.isFinite(length) ? length : null;
    if (bytes === null) {
      const buf = await res.arrayBuffer();
      bytes = buf.byteLength;
    }
    if (!bytes) {
      return { ok: false, code: "image_empty", url: current, status: 200, chain };
    }

    return { ok: true, url: current, status: 200, chain, bytes, contentType: type };
  }

  return { ok: false, code: "image_redirect_loop", url: current, status: null, chain };
}

const HINTS = {
  image_url_not_absolute:
    "og:image / twitter:image must be an absolute https URL — build it with canonicalUrl() in src/lib/social-meta.ts.",
  image_unreachable:
    "The image host did not respond. Regenerate the cards with `bun run gen:asset-og:force` and confirm the file lands in public/og/.",
  image_bad_status:
    "The card returned a non-200 status — the file is missing from public/og/. Run `bun run gen:asset-og:force` and commit the output.",
  image_unexpected_redirect:
    "Social crawlers do not follow arbitrary redirects. Point the tag at the final absolute https URL instead.",
  image_redirect_no_location: "The server returned a redirect without a Location header.",
  image_redirect_loop: "The image URL redirects in a loop; point the tag at the final URL.",
  image_not_an_image:
    "The URL resolved to HTML (usually the SPA fallback), not an image — the card file does not exist at that path.",
  image_empty: "The card responded 200 but with zero bytes; regenerate it.",
};

/* -------------------------------------------------------------------- main */

async function main() {
  const paths = await resolveAssetPaths();
  if (paths.length === 0) {
    console.error("og-image-check: found no /asset/* routes to verify.");
    process.exit(1);
  }

  const results = [];
  let checkedImages = 0;
  const failures = [];

  for (const routePath of paths) {
    let html;
    try {
      html = await loadHtmlForPath(routePath);
    } catch (err) {
      failures.push({ route: routePath, tag: null, url: null, code: "route_unavailable", detail: String(err?.message ?? err) });
      continue;
    }
    if (!html) {
      failures.push({ route: routePath, tag: null, url: null, code: "route_html_missing" });
      continue;
    }

    const images = extractImageUrls(html);
    if (images.length === 0) {
      failures.push({ route: routePath, tag: null, url: null, code: "image_tags_missing" });
      continue;
    }

    const seen = new Map();
    for (const { tag, url } of images) {
      let probe = seen.get(url);
      if (!probe) {
        probe = await probeImage(url);
        seen.set(url, probe);
        checkedImages++;
      }
      results.push({ route: routePath, tag, declared: url, ...probe });
      if (!probe.ok) {
        failures.push({ route: routePath, tag, url: probe.url, code: probe.code, status: probe.status, detail: probe.detail, chain: probe.chain });
      }
    }
  }

  const report = {
    target: REMOTE ? "remote (as declared)" : (DIR ? `dir:${DIR}` : TARGET_ORIGIN),
    routes: paths.length,
    imagesChecked: checkedImages,
    failures,
    results,
  };

  if (OUT) {
    await mkdir(path.dirname(OUT), { recursive: true });
    await writeFile(OUT, JSON.stringify(report, null, 2));
  }

  if (AS_JSON) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`og-image-check — ${paths.length} asset routes, ${checkedImages} unique image URLs`);
    console.log(`  target: ${report.target}`);
    if (failures.length === 0) {
      console.log("  ✓ every OG/Twitter image returned 200 with no unexpected redirect");
    } else {
      console.log(`  ✗ ${failures.length} failure(s):\n`);
      for (const f of failures) {
        console.log(`  ${f.route}${f.tag ? ` [${f.tag}]` : ""}`);
        if (f.url) console.log(`    url:    ${f.url}`);
        console.log(`    issue:  ${f.code}${f.status ? ` (status ${f.status})` : ""}`);
        if (f.detail) console.log(`    detail: ${f.detail}`);
        if (f.chain?.length) {
          for (const hop of f.chain) console.log(`    hop:    ${hop.status} ${hop.from} -> ${hop.to}`);
        }
        const hint = HINTS[f.code];
        if (hint) console.log(`    fix:    ${hint}`);
        console.log("");
      }
    }
  }

  process.exit(failures.length > 0 ? 1 : 0);
}

await main();
