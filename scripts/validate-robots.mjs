#!/usr/bin/env node
/**
 * Validate public/robots.txt:
 *  - parseable, has a `User-agent: *` group
 *  - does not block the whole site
 *  - references the sitemap at the canonical origin
 *  - the sitemap index and every child sitemap it lists are reachable
 *  - no rule blocks a URL advertised in any of the sitemap files
 *
 * Exit code 1 on any error. Run: node scripts/validate-robots.mjs
 */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { SITEMAP_PARTS, readSitemapUrlsXml, parseLocs } from "./sitemap-parts.mjs";

const ROOT = process.cwd();
const BASE_URL = "https://www.getpumppilot.app";

const robotsRaw = await readFile(resolve(ROOT, "public/robots.txt"), "utf8");
const sitemapIndexRaw = await readFile(resolve(ROOT, "public/sitemap.xml"), "utf8");
// URLs live in the child <urlset> files the index points at.
const sitemapRaw = await readSitemapUrlsXml(ROOT);

const errors = [];
const warnings = [];

/** Parse robots.txt into groups keyed by user-agent. */
const groups = [];
let current = null;
let sitemapDirectives = [];

for (const [i, line] of robotsRaw.split(/\r?\n/).entries()) {
  const text = line.replace(/#.*$/, "").trim();
  if (!text) continue;
  const m = text.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
  if (!m) {
    errors.push(`line ${i + 1}: unparseable directive "${line.trim()}"`);
    continue;
  }
  const field = m[1].toLowerCase();
  const value = m[2].trim();
  if (field === "user-agent") {
    if (!current || current.hasRules) {
      current = { agents: [], allow: [], disallow: [], hasRules: false };
      groups.push(current);
    }
    current.agents.push(value.toLowerCase());
  } else if (field === "allow" || field === "disallow") {
    if (!current) {
      errors.push(`line ${i + 1}: "${field}" before any User-agent group`);
      continue;
    }
    current.hasRules = true;
    current[field].push(value);
  } else if (field === "sitemap") {
    sitemapDirectives.push(value);
  } else if (!["crawl-delay", "host"].includes(field)) {
    warnings.push(`line ${i + 1}: unknown directive "${field}"`);
  }
}

const star = groups.find((g) => g.agents.includes("*"));
if (!star) errors.push('missing a "User-agent: *" group');
if (star && !star.allow.includes("/")) errors.push('"User-agent: *" should include "Allow: /"');
if (star && star.disallow.includes("/")) errors.push('"Disallow: /" blocks the entire site');

if (sitemapDirectives.length === 0) errors.push("missing Sitemap: directive");
for (const s of sitemapDirectives) {
  if (!/^https?:\/\//.test(s)) errors.push(`Sitemap must be an absolute URL: ${s}`);
  else if (!s.startsWith(BASE_URL)) errors.push(`Sitemap origin must be ${BASE_URL}: ${s}`);
  else if (!/\/sitemap(-[a-z]+)?\.xml$/.test(s))
    errors.push(`Sitemap should point at the sitemap index or a child sitemap: ${s}`);
}

/** Google-style longest-match rule evaluation for one group. */
function matches(pattern, path) {
  if (pattern === "") return false;
  const anchored = pattern.endsWith("$");
  const raw = anchored ? pattern.slice(0, -1) : pattern;
  const re = new RegExp(
    "^" +
      raw
        .split("*")
        .map((s) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
        .join(".*") +
      (anchored ? "$" : ""),
  );
  return re.test(path);
}

function isBlocked(group, path) {
  let best = null;
  for (const type of ["allow", "disallow"]) {
    for (const p of group[type]) {
      if (!matches(p, path)) continue;
      if (!best || p.length > best.pattern.length) best = { pattern: p, type };
    }
  }
  return best?.type === "disallow";
}

// The index must advertise exactly the child sitemaps we generate, and each
// of those files must exist and be crawlable itself.
const indexLocs = parseLocs(sitemapIndexRaw);
for (const { file } of SITEMAP_PARTS) {
  const expected = `${BASE_URL}/${file}`;
  if (!indexLocs.includes(expected)) errors.push(`sitemap index is missing ${file}`);
  const exists = await readFile(resolve(ROOT, "public", file), "utf8").catch(() => "");
  if (!exists) errors.push(`sitemap index references a missing file: ${file}`);
}
for (const loc of indexLocs) {
  if (!loc.startsWith(BASE_URL)) errors.push(`sitemap index entry is off-origin: ${loc}`);
}

const locs = parseLocs(sitemapRaw);
if (locs.length === 0) errors.push("no <loc> entries found in the child sitemaps");

for (const loc of locs) {
  if (!loc.startsWith(BASE_URL)) {
    errors.push(`sitemap URL is not on ${BASE_URL}: ${loc}`);
    continue;
  }
  const path = new URL(loc).pathname;
  for (const g of groups) {
    if (isBlocked(g, path)) {
      errors.push(
        `robots.txt blocks a sitemap URL: ${path} (User-agent: ${g.agents.join(", ")})`,
      );
    }
  }
}

for (const w of warnings) console.warn(`robots: warning — ${w}`);
if (errors.length) {
  for (const e of errors) console.error(`robots: error — ${e}`);
  process.exit(1);
}
console.log(
  `robots: OK — ${groups.length} group(s), ${sitemapDirectives.length} sitemap ref(s), ${indexLocs.length} child sitemap(s), ${locs.length} sitemap URLs all crawlable`,
);
