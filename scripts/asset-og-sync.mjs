#!/usr/bin/env node
/**
 * Incremental asset OG card generation.
 *
 * Asset social cards (public/og/asset-<symbol>.jpg) are derived from token
 * metadata in src/lib/mock-data.ts and the drawing code in
 * scripts/gen-asset-og.py. Regenerating them on every build is slow and
 * produces churn, so this script fingerprints those inputs and only re-runs
 * the generator (and the social content-hash refresh) when the fingerprint
 * changes or a card is missing.
 *
 * Usage:
 *   node scripts/asset-og-sync.mjs           # regenerate when stale
 *   node scripts/asset-og-sync.mjs --check   # CI gate: fail when stale
 *   node scripts/asset-og-sync.mjs --force   # always regenerate
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const OG_DIR = path.join(ROOT, "public", "og");
const MANIFEST = path.join(OG_DIR, "asset-og-manifest.json");
const GENERATOR = path.join(ROOT, "scripts", "gen-asset-og.py");
const MOCK_DATA = path.join(ROOT, "src", "lib", "mock-data.ts");

const CHECK = process.argv.includes("--check");
const FORCE = process.argv.includes("--force");

const sha = (value) => createHash("sha256").update(value).digest("hex");

/** Token metadata that actually shows up on a card: symbol + display name. */
function tokens() {
  const src = readFileSync(MOCK_DATA, "utf8");
  const found = [...src.matchAll(/symbol:\s*"([A-Z0-9]+)",\s*\n\s*name:\s*"([^"]+)"/g)];
  return found.map(([, symbol, name]) => ({ symbol, name }));
}

const assets = tokens();
if (assets.length === 0) {
  console.error(
    "asset-og-sync: no token metadata parsed from src/lib/mock-data.ts — refusing to touch the cards.",
  );
  process.exit(1);
}

/**
 * Fingerprint = token metadata + generator source. A change in either means
 * the rendered cards are out of date; anything else leaves them alone.
 */
const fingerprint = sha(
  JSON.stringify({
    tokens: assets,
    generator: sha(readFileSync(GENERATOR, "utf8")),
    version: 1,
  }),
);

const expected = assets.map((a) => `asset-${a.symbol.toLowerCase()}.jpg`);
const missing = expected.filter((f) => !existsSync(path.join(OG_DIR, f)));

const previous = existsSync(MANIFEST)
  ? JSON.parse(readFileSync(MANIFEST, "utf8"))
  : null;

const reasons = [];
if (FORCE) reasons.push("--force requested");
if (!previous) reasons.push("no manifest recorded yet");
else if (previous.fingerprint !== fingerprint) reasons.push("token metadata or generator changed");
if (missing.length) reasons.push(`missing cards: ${missing.join(", ")}`);

if (reasons.length === 0) {
  console.log(
    `asset OG cards up to date (${expected.length} tokens, fingerprint ${fingerprint.slice(0, 10)}) — skipped regeneration`,
  );
  process.exit(0);
}

if (CHECK) {
  console.error("asset OG cards are stale:");
  for (const reason of reasons) console.error(`  - ${reason}`);
  console.error("Run: bun run gen:asset-og");
  process.exit(1);
}

console.log(`asset OG cards stale — ${reasons.join("; ")}`);

const python = spawnSync("python3", [GENERATOR], { stdio: "inherit", cwd: ROOT });
if (python.status !== 0) {
  console.error("asset-og-sync: gen-asset-og.py failed — cards left unchanged.");
  process.exit(python.status ?? 1);
}

// Card bytes changed, so the ?v= content hashes must be refreshed too.
const hashes = spawnSync("node", [path.join(ROOT, "scripts", "social-image-hashes.mjs")], {
  stdio: "inherit",
  cwd: ROOT,
});
if (hashes.status !== 0) {
  console.error("asset-og-sync: social image hash refresh failed.");
  process.exit(hashes.status ?? 1);
}

mkdirSync(OG_DIR, { recursive: true });
writeFileSync(
  MANIFEST,
  `${JSON.stringify(
    {
      version: 1,
      fingerprint,
      generatedAt: new Date().toISOString(),
      tokens: assets.map((a) => a.symbol),
      cards: expected,
    },
    null,
    2,
  )}\n`,
);

console.log(`regenerated ${expected.length} asset OG cards (fingerprint ${fingerprint.slice(0, 10)})`);
