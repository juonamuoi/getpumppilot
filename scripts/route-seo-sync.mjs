#!/usr/bin/env node
/**
 * Automatic OG / Twitter metadata refresh for new routes.
 *
 * Whenever a new page route is added (e.g. `src/routes/quests.tsx`), this
 * script makes sure it ships share metadata instead of silently inheriting the
 * root defaults:
 *
 *   - a `head()` with title + description
 *   - og:title / og:description / og:type (filled by `withSocialMeta`)
 *   - twitter:card / twitter:title / twitter:description / twitter:image
 *     (also filled by `withSocialMeta`)
 *   - a self-referencing canonical via `canonicalLinks(path)`
 *
 * Routes missing a `head()` get a scaffolded one written in place; routes that
 * already declare metadata are left untouched (the helper is idempotent).
 * Sitemap coverage is handled by scripts/gen-sitemap.mjs, which walks the same
 * route directory — run both together via `bun run sync:seo`.
 *
 * Usage:
 *   node scripts/route-seo-sync.mjs            # scaffold missing metadata
 *   node scripts/route-seo-sync.mjs --check    # exit 1 if any route lacks it
 */
import { readFile, writeFile, readdir } from "node:fs/promises";
import { resolve, join } from "node:path";

const ROOT = process.cwd();
const ROUTES_DIR = resolve(ROOT, "src/routes");
const CHECK = process.argv.includes("--check");

/** Route files with no HTML share surface. */
const SKIP_FILE = [/^__root/, /^api[./]/, /\[/];

async function walk(dir, prefix = "") {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const name = entry.name;
    if (name === "api" || name.startsWith("[")) continue;
    if (entry.isDirectory()) out.push(...(await walk(join(dir, name), `${prefix}${name}.`)));
    else if (name.endsWith(".tsx")) out.push({ file: join(dir, name), id: prefix + name.replace(/\.tsx$/, "") });
  }
  return out;
}

/** "quests" -> "/quests", "blog.$slug" -> "/blog/$slug", "pump.index" -> "/pump" */
function idToPath(id) {
  const parts = id.split(".").filter((s) => s !== "index" && !s.startsWith("_"));
  return "/" + parts.join("/");
}

/** "/pump-history" -> "PUMP history" style human label. */
function humanize(path) {
  const last = path.split("/").filter(Boolean).pop() ?? "home";
  const words = last.replace(/\$/g, "").split("-").filter(Boolean);
  if (words.length === 0) return "Home";
  const label = words
    .map((w) => (w.toLowerCase() === "pump" || w.toLowerCase() === "ai" ? w.toUpperCase() : w))
    .join(" ");
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function scaffold(src, path) {
  const label = humanize(path);
  const title = `${label} | PumpPilot AI`;
  const description = `${label} on PumpPilot AI — spot momentum, control risk, trade smarter with live market data and read-only wallet insight.`;
  const head = `  head: () => ({
    meta: withSocialMeta(
      [
        { title: ${JSON.stringify(title)} },
        {
          name: "description",
          content: ${JSON.stringify(description)},
        },
        { property: "og:title", content: ${JSON.stringify(label)} },
        {
          property: "og:description",
          content: ${JSON.stringify(description)},
        },
        { property: "og:type", content: "website" },
      ],
      { url: ${JSON.stringify(`https://www.getpumppilot.app${path}`)} },
    ),
    links: canonicalLinks(${JSON.stringify(path)}),
  }),
`;

  let out = src.replace(/(createFileRoute\(\s*"[^"]*"\s*\)\(\{\s*\n)/, `$1${head}`);
  if (out === src) return null;
  if (!/from "@\/lib\/social-meta"/.test(out))
    out = `import { withSocialMeta } from "@/lib/social-meta";\n${out}`;
  if (!/canonicalLinks[^\n]*from "@\/lib\/structured-data"/.test(out)) {
    if (/from "@\/lib\/structured-data"/.test(out))
      out = out.replace(/import \{([^}]*)\} from "@\/lib\/structured-data";/, (_m, names) =>
        `import {${names.trimEnd()}, canonicalLinks } from "@/lib/structured-data";`,
      );
    else out = `import { canonicalLinks } from "@/lib/structured-data";\n${out}`;
  }
  return out;
}

const files = await walk(ROUTES_DIR);
const scaffolded = [];
const missing = [];

for (const { file, id } of files) {
  if (SKIP_FILE.some((re) => re.test(id))) continue;
  const src = await readFile(file, "utf8");
  if (!/createFileRoute\(/.test(src)) continue;
  // Server-only file routes (sitemap.xml, feeds, …) have no share surface.
  if (/server:\s*\{/.test(src) && !/component:/.test(src)) continue;
  if (/\bhead:\s*\(/.test(src)) continue;

  const path = idToPath(id).replace(/\/$/, "") || "/";
  if (CHECK) {
    missing.push(path);
    continue;
  }
  const next = scaffold(src, path);
  if (!next) {
    missing.push(path);
    continue;
  }
  await writeFile(file, next);
  scaffolded.push(path);
}

if (CHECK) {
  if (missing.length) {
    console.error(
      `route-seo: ${missing.length} route(s) without OG/Twitter metadata — run \`bun run sync:seo\`:\n  ${missing.join("\n  ")}`,
    );
    process.exit(1);
  }
  console.log(`route-seo: all ${files.length} route files declare share metadata`);
} else if (scaffolded.length) {
  console.log(`route-seo: scaffolded metadata for ${scaffolded.length} route(s):\n  ${scaffolded.join("\n  ")}`);
  if (missing.length)
    console.warn(`route-seo: could not auto-scaffold (add head() manually): ${missing.join(", ")}`);
} else {
  console.log("route-seo: metadata up to date");
  if (missing.length) {
    console.error(`route-seo: manual head() needed for: ${missing.join(", ")}`);
    process.exit(1);
  }
}
