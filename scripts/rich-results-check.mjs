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
import { readSitemapUrlsXml } from "./sitemap-parts.mjs";

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
    "Google drops the entire block when JSON.parse fails. Emit it with JSON.stringify() from the route's head() scripts array — never hand-built string concatenation.",
  route_unavailable:
    "The route did not return 200, so crawlers see no structured data. Fix the route or remove it from the sitemap.",
  // Article / BlogPosting
  article_headline_missing: "Set `headline` on the BlogPosting node in src/lib/structured-data.ts.",
  article_headline_too_long: "Trim the headline to 110 characters or fewer.",
  article_image_missing: "Add an absolute https `image` (1200x630 recommended) to the article node.",
  article_image_not_https: "Rebuild the image URL with canonicalUrl() so it is absolute https.",
  article_author_missing: "Add `author` (Person or Organization) to the article node.",
  article_author_name_missing: "Give the author node a `name`.",
  article_author_type_invalid: "`author` must be @type Person or Organization.",
  article_publisher_missing: "Reference the site Organization node as `publisher`.",
  article_publisher_name_missing: "The publisher node needs a `name`.",
  article_publisher_logo_missing: "Add an ImageObject `logo` to the publisher Organization.",
  article_date_published_invalid: "Use an ISO-8601 `datePublished` (new Date(...).toISOString()).",
  article_date_modified_missing: "Add `dateModified`; Google uses it for freshness.",
  article_date_modified_invalid: "Use an ISO-8601 `dateModified`.",
  article_main_entity_missing: "Point `mainEntityOfPage` at this page's canonical URL.",
  article_main_entity_invalid: "`mainEntityOfPage` must resolve to the page's canonical URL.",
  // Breadcrumbs
  breadcrumb_too_short: "A BreadcrumbList needs at least two ListItems.",
  breadcrumb_position: "ListItem `position` values must start at 1 and increment by 1.",
  breadcrumb_item_type: "Each entry must be @type ListItem.",
  breadcrumb_name_missing: "Give every ListItem a `name`.",
  breadcrumb_item_missing: "Give every ListItem an `item` URL (last item may omit it).",
  breadcrumb_item_not_https: "Breadcrumb `item` URLs must be absolute https.",
  // FAQ
  faq_empty: "FAQPage needs at least one Question in `mainEntity`.",
  faq_question_type: "Each mainEntity entry must be @type Question.",
  faq_question_name: "Each Question needs a `name` (the question text).",
  faq_answer_missing: "Each Question needs an `acceptedAnswer`.",
  faq_answer_type: "`acceptedAnswer` must be @type Answer.",
  faq_answer_text: "`acceptedAnswer.text` must be non-empty answer copy.",
  faq_answer_unsafe_html: "Answer text may only contain Google's allowed inline HTML.",
  // HowTo
  howto_name_missing: "Add a `name` to the HowTo node.",
  howto_too_few_steps: "A HowTo needs at least two HowToStep entries.",
  howto_step_type: "Each step must be @type HowToStep.",
  howto_step_name: "Give every HowToStep a `name`.",
  howto_step_text: "Give every HowToStep a `text` instruction.",
  // Organization / WebSite
  org_name_missing: "Add `name` to the Organization node.",
  org_url_invalid: "Organization `url` must be the absolute https homepage.",
  org_logo_missing: "Add an ImageObject `logo` to the Organization.",
  org_logo_not_https: "The Organization logo URL must be absolute https.",
  org_same_as_missing:
    "Optional: list verified social/profile URLs in `sameAs` to strengthen knowledge-panel signals.",
  org_same_as_not_https: "Every `sameAs` entry must be an absolute https URL.",
  website_name_missing: "Add `name` to the WebSite node.",
  search_action_target_invalid:
    "SearchAction `target` must be an absolute https URL template containing {search_term_string}.",
  search_action_query_input_missing: "Add `query-input` to the SearchAction.",
  search_action_query_input_format:
    "Use the exact form `required name=search_term_string`.",
  search_action_query_input_mismatch:
    "The query-input name must match the placeholder used in `target`.",
  // Product / offers / ratings
  product_name_missing: "Add `name` to the Product node.",
  product_image_missing: "Add at least one absolute https `image` to the Product.",
  offers_missing: "Add an `offers` node with price and priceCurrency.",
  offer_price_missing: "Add `price` to the Offer.",
  offer_price_format: "`price` must be a plain number string (no currency symbols).",
  offer_currency_invalid: "`priceCurrency` must be a 3-letter ISO 4217 code.",
  rating_value_invalid: "`ratingValue` must be numeric and inside the rating scale.",
  rating_count_invalid: "`ratingCount`/`reviewCount` must be a positive integer.",
  // SoftwareApplication
  app_name_missing: "Add `name` to the SoftwareApplication node.",
  app_category_missing: "Add `applicationCategory`.",
  app_os_missing: "Add `operatingSystem`.",
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
    const xml = await readSitemapUrlsXml();
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
