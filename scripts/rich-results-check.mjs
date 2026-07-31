#!/usr/bin/env bun
/**
 * Rich-results build gate.
 *
 * Renders the production build output (or a live SSR server) and runs the
 * same eligibility rules Google's Rich Results Test applies:
 *   1. every <script type="application/ld+json"> block must PARSE,
 *   2. every rich-result-bearing @type must carry its required signals.
 *
 * Unlike check:jsonld (structural validity) this reports *actionable* output:
 * the failing route, the JSON path of the node, the property at fault, and a
 * concrete fix hint per issue code.
 *
 * Usage:
 *   bun scripts/rich-results-check.mjs [--dir dist] [--server http://localhost:8080]
 *                                      [--strict] [--json] [--out file.json]
 *
 * Exit 1 on any error (or any warning with --strict).
 */
import { readdir, readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

import {
  checkRichResults,
  extractJsonLdBlocks,
  parseJsonLdBlocks,
} from "../src/lib/jsonld-rich-results.ts";

const args = process.argv.slice(2);
const flag = (name, fallback = null) => {
  const i = args.indexOf(name);
  return i !== -1 ? (args[i + 1] ?? fallback) : fallback;
};
const DIR = flag("--dir");
const SERVER = flag("--server");
const OUT = flag("--out");
const STRICT = args.includes("--strict");
const AS_JSON = args.includes("--json");
const ROOTS = DIR ? [DIR] : ["dist", ".output/public", ".output"];

/** Fix hints keyed by issue code — what to change and where. */
const HINTS = {
  jsonld_parse_error:
    "Google drops the whole block when JSON.parse fails. Emit it with JSON.stringify() in the route's head() scripts array — never hand-built string concatenation.",
  missing_required:
    "Add the property in src/lib/structured-data.ts for this node type; Google marks the item invalid without it.",
  missing_recommended:
    "Optional for validity but Google uses it to rank rich-result eligibility — add it if the data exists.",
  invalid_url:
    "Use an absolute https URL built from canonicalUrl() — relative paths and http are rejected.",
  invalid_date:
    "Use an ISO-8601 timestamp (e.g. new Date(...).toISOString()).",
  too_long: "Shorten the value; Google truncates or rejects over-long fields.",
  broken_reference:
    "The @id referenced here has no matching node in the page @graph — emit the target node or drop the reference.",
  image_ratio:
    "Supply at least one 1200x630 (1.91:1) image; smaller assets lose the image treatment.",
};
const hintFor = (code) =>
  HINTS[code] ?? "Review this node against Google's rich-result requirements for its @type.";

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
    } else if (entry.name.endsWith(".html")) out.push(full);
  }
  return out;
}

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

const sources = [];
const fetchErrors = [];
let scope = "";

const root = ROOTS.find((candidate) => candidate && existsSync(candidate));
if (root && !SERVER) {
  scope = root;
  const info = await stat(root);
  const files = info.isDirectory() ? await walk(root) : [root];
  for (const file of files) {
    sources.push({
      label: path.relative(root, file) || path.basename(file),
      html: await readFile(file, "utf8"),
    });
  }
}

// Worker/edge presets emit no prerendered HTML — fall back to live SSR.
if (sources.length === 0) {
  const base = (SERVER ?? "http://localhost:8080").replace(/\/$/, "");
  scope = base;
  let reachable = false;
  for (const routePath of await sitemapPaths()) {
    try {
      const response = await fetch(`${base}${routePath}`, { headers: { accept: "text/html" } });
      reachable = true;
      if (!response.ok) {
        fetchErrors.push({
          source: routePath,
          path: "http",
          type: "(route)",
          severity: "error",
          code: "route_unavailable",
          message: `expected 200, got ${response.status}`,
        });
        continue;
      }
      sources.push({ label: routePath, html: await response.text() });
    } catch {
      /* reported below */
    }
  }
  if (!reachable) {
    console.error(
      `Rich-results check: no build output and no SSR server reachable at ${base}. Run \`bun run build\` or start the app, then re-run.`,
    );
    process.exit(1);
  }
}

const reports = [];
const issues = [...fetchErrors];
let blocks = 0;
let pagesWithJsonLd = 0;

for (const { label, html } of sources) {
  const raw = extractJsonLdBlocks(html);
  if (raw.length === 0) continue;
  pagesWithJsonLd += 1;
  blocks += raw.length;
  const { docs, parseErrors } = parseJsonLdBlocks(raw, label);
  const report = checkRichResults(docs, label);
  const all = [...parseErrors, ...report.issues];
  issues.push(...all);
  reports.push({
    route: label,
    types: report.types,
    blocks: raw.length,
    errors: all.filter((i) => i.severity === "error").length,
    warnings: all.filter((i) => i.severity === "warning").length,
  });
}

const errors = issues.filter((i) => i.severity === "error");
const warnings = issues.filter((i) => i.severity === "warning");
const eligibleTypes = [...new Set(reports.flatMap((r) => r.types))].sort();

const payload = {
  scope,
  strict: STRICT,
  documents: sources.length,
  pagesWithJsonLd,
  blocks,
  eligibleTypes,
  errors: errors.length,
  warnings: warnings.length,
  reports,
  issues: issues.map((i) => ({ ...i, hint: hintFor(i.code) })),
};

if (OUT) {
  await mkdir(path.dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(payload, null, 2));
}

if (AS_JSON) {
  console.log(JSON.stringify(payload, null, 2));
} else {
  console.log(`Rich results check — ${scope}`);
  console.log(`  Mode                : ${STRICT ? "strict (warnings fail)" : "errors fail"}`);
  console.log(`  Documents scanned   : ${sources.length}`);
  console.log(`  Pages with JSON-LD  : ${pagesWithJsonLd}`);
  console.log(`  JSON-LD blocks      : ${blocks}`);
  console.log(`  Rich-result types   : ${eligibleTypes.join(", ") || "none"}`);
  console.log(`  Errors              : ${errors.length}`);
  console.log(`  Warnings            : ${warnings.length}`);
  console.log("");
  if (issues.length === 0) {
    console.log("  ✓ Google can parse every JSON-LD block and all rich-result signals are present");
  } else {
    for (const issue of [...errors, ...warnings]) {
      const mark = issue.severity === "error" ? "✗" : "!";
      console.log(`  ${mark} [${issue.code}] ${issue.source} ${issue.path} (${issue.type})`);
      console.log(`      ${issue.message}`);
      console.log(`      fix: ${hintFor(issue.code)}`);
    }
  }
}

if (blocks === 0) {
  console.error("No JSON-LD found in any scanned document — structured data is missing.");
  process.exit(1);
}

process.exit(errors.length > 0 || (STRICT && warnings.length > 0) ? 1 : 0);
