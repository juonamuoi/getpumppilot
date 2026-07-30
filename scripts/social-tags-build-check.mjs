#!/usr/bin/env bun
/**
 * Pre-deploy OpenGraph / Twitter Card check.
 *
 * Scans rendered HTML (build output, or a running SSR server) and validates
 * every document's social sharing tags with the same validator used by the
 * SEO test suite (src/lib/social-tags-validate.ts).
 *
 * Usage:
 *   bun scripts/social-tags-build-check.mjs [--dir dist] [--server http://localhost:8080]
 *                                           [--allow-missing] [--json]
 *
 * Exit code 1 when any route emits invalid or missing OG/Twitter tags.
 */
import { readdir, readFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

import {
  checkSocialTags,
  parseSocialTagsFromHtml,
} from "../src/lib/social-tags-validate.ts";

const args = process.argv.slice(2);
const dirArg = args.indexOf("--dir");
const serverArg = args.indexOf("--server");
const ROOTS = dirArg !== -1 ? [args[dirArg + 1]] : ["dist", ".output/public", ".output"];
const SERVER = serverArg !== -1 ? args[serverArg + 1] : null;
const ALLOW_MISSING = args.includes("--allow-missing");
const AS_JSON = args.includes("--json");

async function walk(dir, out = []) {
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
      await walk(full, out);
    } else if (entry.name.endsWith(".html")) {
      out.push(full);
    }
  }
  return out;
}

/** Routes to render when checking a live SSR server (from public/sitemap.xml). */
async function sitemapPaths() {
  try {
    const xml = await readFile("public/sitemap.xml", "utf8");
    const paths = [...xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/g)].map((m) => {
      try {
        return new URL(m[1]).pathname;
      } catch {
        return m[1].startsWith("/") ? m[1] : `/${m[1]}`;
      }
    });
    return [...new Set(paths.length ? paths : ["/"])];
  } catch {
    return ["/"];
  }
}

/** "dist/blog/foo/index.html" -> "/blog/foo" */
function pathFromFile(rel) {
  const clean = rel.replace(/\\/g, "/").replace(/index\.html$/, "").replace(/\.html$/, "");
  const withSlash = clean.startsWith("/") ? clean : `/${clean}`;
  const trimmed = withSlash.replace(/\/+$/, "");
  return trimmed === "" ? "/" : trimmed;
}

const failures = [];
const sources = []; // { label, path, html }
let scope = "";

const root = ROOTS.find((candidate) => candidate && existsSync(candidate));

if (root && !SERVER) {
  scope = root;
  const info = await stat(root);
  const files = info.isDirectory() ? await walk(root) : [root];
  for (const file of files) {
    const rel = path.relative(root, file) || path.basename(file);
    sources.push({ label: rel, path: pathFromFile(rel), html: await readFile(file, "utf8") });
  }
}

// Prerendered HTML is optional (edge/worker presets emit none). Fall back to
// rendering routes against a running SSR server so CI still validates output.
if (sources.length === 0) {
  const base = (SERVER ?? "http://localhost:8080").replace(/\/$/, "");
  scope = base;
  let reachable = false;
  for (const routePath of await sitemapPaths()) {
    try {
      const response = await fetch(`${base}${routePath}`, { headers: { accept: "text/html" } });
      reachable = true;
      if (!response.ok) {
        failures.push({
          id: routePath,
          tag: "http",
          code: "bad_status",
          message: `expected 200, got ${response.status}`,
        });
        continue;
      }
      sources.push({ label: routePath, path: routePath, html: await response.text() });
    } catch {
      /* server not reachable — reported below */
    }
  }
  if (!reachable) {
    const message = `No prerendered HTML in build output and no SSR server reachable at ${base}. Start the app (or pass --server <url>) before running the social tag check.`;
    console[ALLOW_MISSING ? "warn" : "error"](message);
    process.exit(ALLOW_MISSING ? 0 : 1);
  }
}

let checked = 0;
let skipped = 0;

for (const { label, path: routePath, html } of sources) {
  const set = parseSocialTagsFromHtml(html, label, routePath);
  if (set.noindex) {
    skipped += 1;
    continue;
  }
  checked += 1;
  failures.push(...checkSocialTags(set));
}

if (AS_JSON) {
  console.log(
    JSON.stringify({ scope, documents: sources.length, checked, skipped, failures }, null, 2),
  );
} else {
  console.log(`OpenGraph / Twitter Card check — ${scope}`);
  console.log(`  Documents scanned : ${sources.length}`);
  console.log(`  Routes validated  : ${checked}`);
  console.log(`  Skipped (noindex) : ${skipped}`);
  if (failures.length === 0) {
    console.log("  Issues            : 0  ✓ all routes share correctly");
  } else {
    console.log(`  Issues            : ${failures.length}\n`);
    for (const f of failures) {
      console.log(`  ✗ ${f.id} [${f.tag}] ${f.code}: ${f.message}`);
    }
  }
}

if (checked === 0 && failures.length === 0) {
  console.error("No indexable documents scanned — social tags were not validated.");
  process.exit(ALLOW_MISSING ? 0 : 1);
}

process.exit(failures.length > 0 ? 1 : 0);
