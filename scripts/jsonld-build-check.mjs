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

const root = ROOTS.find((candidate) => candidate && existsSync(candidate));

if (!root) {
  const message = `No build output found (looked in: ${ROOTS.join(", ")}). Run \`bun run build\` first.`;
  console[ALLOW_MISSING ? "warn" : "error"](message);
  process.exit(ALLOW_MISSING ? 0 : 1);
}

const info = await stat(root);
const files = info.isDirectory() ? await walk(root) : [root];

let blocks = 0;
let pages = 0;
const failures = [];

for (const file of files) {
  const html = await readFile(file, "utf8");
  const matches = [...html.matchAll(LD_RE)];
  if (matches.length === 0) continue;
  pages += 1;
  matches.forEach((match, index) => {
    blocks += 1;
    const label = `${path.relative(root, file)} #${index + 1}`;
    const issues = validateJsonLdSource(decodeEntities(match[1].trim()), label);
    for (const issue of issues) {
      failures.push({ file: path.relative(root, file), block: index + 1, ...issue });
    }
  });
}

if (AS_JSON) {
  console.log(
    JSON.stringify(
      { root, htmlFiles: files.length, pagesWithJsonLd: pages, blocks, failures },
      null,
      2,
    ),
  );
} else {
  console.log(`JSON-LD build check — ${root}`);
  console.log(`  HTML files scanned : ${files.length}`);
  console.log(`  Pages with JSON-LD : ${pages}`);
  console.log(`  JSON-LD blocks     : ${blocks}`);
  if (failures.length === 0) {
    console.log("  Malformed nodes    : 0  ✓ all structured data valid");
  } else {
    console.log(`  Malformed nodes    : ${failures.length}`);
    console.log("");
    for (const failure of failures) {
      console.log(`  ✗ ${failure.file} (block ${failure.block}) ${failure.path}: ${failure.message}`);
    }
  }
}

if (blocks === 0) {
  console.warn(
    "No JSON-LD found in the build output — the prerender may not have emitted HTML pages.",
  );
}

process.exit(failures.length > 0 ? 1 : 0);
