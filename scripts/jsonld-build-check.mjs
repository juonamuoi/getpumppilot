#!/usr/bin/env bun
/**
 * Production build JSON-LD check.
 *
 * Scans the built output for every `<script type="application/ld+json">`
 * block and validates it with the same validator used by the SEO test
 * suite (src/lib/jsonld-validate.ts): valid JSON, correct @context/@type,
 * required fields, and absolute non-placeholder URLs.
 *
 * Usage:
 *   bun scripts/jsonld-build-check.mjs [--dir dist] [--allow-missing] [--json]
 *
 * Exit code 1 when any malformed node is found (or the build output is
 * missing, unless --allow-missing is passed).
 */
import { readdir, readFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

import { validateJsonLdSource } from "../src/lib/jsonld-validate.ts";

const args = process.argv.slice(2);
const dirArg = args.indexOf("--dir");
const ROOTS = dirArg !== -1 ? [args[dirArg + 1]] : ["dist", ".output/public", ".output"];
const ALLOW_MISSING = args.includes("--allow-missing");
const AS_JSON = args.includes("--json");

const LD_RE = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

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

function decodeEntities(raw) {
  return raw
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&apos;/g, "'")
    .replace(/&#x2F;/g, "/")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}




const serverArg = args.indexOf("--server");
const SERVER = serverArg !== -1 ? args[serverArg + 1] : null;

/** Routes to render when checking a live SSR server (from public/sitemap.xml). */
async function sitemapPaths() {
  try {
    const xml = await readFile("public/sitemap.xml", "utf8");
    const urls = [...xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/g)].map((m) => m[1]);
    const paths = urls.map((u) => {
      try {
        return new URL(u).pathname;
      } catch {
        return u.startsWith("/") ? u : `/${u}`;
      }
    });
    return [...new Set(paths.length ? paths : ["/"])];
  } catch {
    return ["/"];
  }
}

const failures = [];
let sources = []; // { label, html }

const root = ROOTS.find((candidate) => candidate && existsSync(candidate));
let scope = root ?? SERVER ?? "";

if (root && !SERVER) {
  const info = await stat(root);
  const files = info.isDirectory() ? await walk(root) : [root];
  for (const file of files) {
    sources.push({ label: path.relative(root, file), html: await readFile(file, "utf8") });
  }
}

// Prerendered HTML is optional (edge/worker presets emit none). Fall back to
// rendering routes against a running SSR server so CI still validates output.
if (sources.length === 0) {
  const base = (SERVER ?? "http://localhost:8080").replace(/\/$/, "");
  scope = base;
  const paths = await sitemapPaths();
  let reachable = false;
  for (const routePath of paths) {
    try {
      const response = await fetch(`${base}${routePath}`, {
        headers: { accept: "text/html" },
      });
      reachable = true;
      if (!response.ok) {
        failures.push({
          file: routePath,
          block: 0,
          path: "http",
          message: `expected 200, got ${response.status}`,
        });
        continue;
      }
      sources.push({ label: routePath, html: await response.text() });
    } catch {
      /* server not reachable — reported below */
    }
  }
  if (!reachable) {
    const message = `No prerendered HTML in build output and no SSR server reachable at ${base}. Start the app (or pass --server <url>) before running the JSON-LD check.`;
    console[ALLOW_MISSING ? "warn" : "error"](message);
    process.exit(ALLOW_MISSING ? 0 : 1);
  }
}

let blocks = 0;
let pages = 0;

for (const { label, html } of sources) {
  const matches = [...html.matchAll(LD_RE)];
  if (matches.length === 0) continue;
  pages += 1;
  matches.forEach((match, index) => {
    blocks += 1;
    const issues = validateJsonLdSource(
      decodeEntities(match[1].trim()),
      `${label} #${index + 1}`,
    );
    for (const issue of issues) {
      failures.push({ file: label, block: index + 1, ...issue });
    }
  });
}

if (AS_JSON) {
  console.log(
    JSON.stringify(
      { scope, documents: sources.length, pagesWithJsonLd: pages, blocks, failures },
      null,
      2,
    ),
  );
} else {
  console.log(`JSON-LD build check — ${scope}`);
  console.log(`  Documents scanned  : ${sources.length}`);
  console.log(`  Pages with JSON-LD : ${pages}`);
  console.log(`  JSON-LD blocks     : ${blocks}`);
  if (failures.length === 0) {
    console.log("  Malformed nodes    : 0  ✓ all structured data valid");
  } else {
    console.log(`  Malformed nodes    : ${failures.length}`);
    console.log("");
    for (const failure of failures) {
      console.log(
        `  ✗ ${failure.file} (block ${failure.block}) ${failure.path}: ${failure.message}`,
      );
    }
  }
}

if (blocks === 0 && failures.length === 0) {
  console.error("No JSON-LD found in any scanned document — structured data is missing.");
  process.exit(1);
}

process.exit(failures.length > 0 ? 1 : 0);

