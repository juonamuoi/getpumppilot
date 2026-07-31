#!/usr/bin/env bun
/**
 * CI gate: validate every rendered JSON-LD block against the official
 * schema.org vocabulary.
 *
 * Fails the build on:
 *   - invalid / unknown @type values
 *   - properties that do not exist in schema.org
 *   - (strict, the CI default) warnings such as properties used on a type
 *     that does not declare them
 *
 * Sources, in order of preference:
 *   1. prerendered HTML in the build output (dist / .output/public)
 *   2. routes rendered by a running SSR server (sitemap-driven)
 *
 * Usage:
 *   bun scripts/schema-org-check.mjs [--dir dist] [--server http://localhost:8080]
 *                                    [--no-strict] [--json] [--allow-missing]
 */
import { readdir, readFile, mkdir, writeFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

import { checkSchemaOrg, SCHEMA_ORG_VERSION } from "../src/lib/schema-org-validate.ts";
import { extractJsonLdBlocks, parseJsonLdBlocks } from "../src/lib/jsonld-rich-results.ts";

const args = process.argv.slice(2);
const flagValue = (name) => {
  const i = args.indexOf(name);
  return i !== -1 ? args[i + 1] : null;
};

const DIR = flagValue("--dir");
const SERVER = flagValue("--server");
const STRICT = !args.includes("--no-strict");
const AS_JSON = args.includes("--json");
const ALLOW_MISSING = args.includes("--allow-missing");
const ROOTS = DIR ? [DIR] : ["dist", ".output/public", ".output"];

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

const sources = [];
let scope = "";
const root = ROOTS.find((candidate) => candidate && existsSync(candidate));

if (root && !SERVER) {
  scope = root;
  const info = await stat(root);
  const files = info.isDirectory() ? await walkHtml(root) : [root];
  for (const file of files) {
    sources.push({
      label: path.relative(root, file) || path.basename(file),
      html: await readFile(file, "utf8"),
    });
  }
}

if (sources.length === 0) {
  const base = (SERVER ?? "http://localhost:8080").replace(/\/$/, "");
  scope = base;
  let reachable = false;
  for (const routePath of await sitemapPaths()) {
    try {
      const response = await fetch(`${base}${routePath}`, { headers: { accept: "text/html" } });
      reachable = true;
      if (!response.ok) continue;
      sources.push({ label: routePath, html: await response.text() });
    } catch {
      /* reported below */
    }
  }
  if (!reachable) {
    const message = `No prerendered HTML and no SSR server reachable at ${base}. Start the app or pass --server <url>.`;
    console[ALLOW_MISSING ? "warn" : "error"](message);
    process.exit(ALLOW_MISSING ? 0 : 1);
  }
}

const errors = [];
const warnings = [];
const parseFailures = [];
let blocks = 0;
let nodes = 0;
let pages = 0;

for (const { label, html } of sources) {
  const raw = extractJsonLdBlocks(html);
  if (raw.length === 0) continue;
  pages += 1;
  blocks += raw.length;

  const parsed = parseJsonLdBlocks(raw, label);
  for (const issue of parsed.parseErrors ?? []) {
    parseFailures.push({ source: label, path: issue.path, type: issue.type, message: issue.message });
  }

  const report = checkSchemaOrg(parsed.docs ?? [], label);
  nodes += report.nodes;
  errors.push(...report.errors);
  warnings.push(...report.warnings);
}

const failures = [
  ...parseFailures.map((f) => ({ ...f, severity: "error", code: "parse-error" })),
  ...errors,
  ...(STRICT ? warnings : []),
];

const summary = {
  vocabulary: SCHEMA_ORG_VERSION,
  scope,
  strict: STRICT,
  documents: sources.length,
  pagesWithJsonLd: pages,
  blocks,
  nodes,
  errors: errors.length + parseFailures.length,
  warnings: warnings.length,
  failed: failures.length > 0 || blocks === 0,
  issues: [...parseFailures, ...errors, ...warnings],
};

await mkdir("test-artifacts", { recursive: true });
await writeFile("test-artifacts/schema-org-report.json", `${JSON.stringify(summary, null, 2)}\n`);

if (AS_JSON) {
  console.log(JSON.stringify(summary, null, 2));
} else {
  console.log(`schema.org validation — ${scope}`);
  console.log(`  Vocabulary snapshot : ${SCHEMA_ORG_VERSION}`);
  console.log(`  Mode                : ${STRICT ? "strict (warnings fail)" : "errors only"}`);
  console.log(`  Documents scanned   : ${sources.length}`);
  console.log(`  Pages with JSON-LD  : ${pages}`);
  console.log(`  JSON-LD blocks      : ${blocks}`);
  console.log(`  Nodes validated     : ${nodes}`);
  console.log(`  Errors              : ${errors.length + parseFailures.length}`);
  console.log(`  Warnings            : ${warnings.length}`);
  if (parseFailures.length) {
    console.log("");
    for (const f of parseFailures) console.log(`  ✗ [parse-error] ${f.source}: ${f.message}`);
  }
  for (const list of [errors, warnings]) {
    if (!list.length) continue;
    console.log("");
    for (const i of list) {
      console.log(
        `  ${i.severity === "error" ? "✗" : "!"} [${i.code}] ${i.source} ${i.path} (${i.type}): ${i.message}`,
      );
    }
  }
  if (failures.length === 0 && blocks > 0) {
    console.log("\n  ✓ All JSON-LD validates against schema.org");
  }
}

if (blocks === 0) {
  console.error("No JSON-LD found in any scanned document — structured data is missing.");
  process.exit(1);
}

process.exit(failures.length > 0 ? 1 : 0);
