#!/usr/bin/env node
/**
 * Pull-request security finding gate.
 *
 * Re-runs the project's security analysis on every PR but fails the job for
 * exactly two findings:
 *
 *   - open_dex_quote
 *       The DEX quote server function must require an authenticated Supabase
 *       session and throttle per user before it spends the paid aggregator
 *       key. Any other server function that reaches a quote/aggregator
 *       endpoint must be authenticated too.
 *
 *   - SUPA_function_search_path_mutable
 *       Every function in the public schema must pin `SET search_path`.
 *
 * Everything else the scanners report is printed as advisory output and does
 * NOT fail the run. Advisory items can be tracked and explained in
 * `security/findings-allowlist.json`; gated findings can never be listed there
 * (an attempt to do so is a configuration error and fails the run).
 *
 * Usage: node scripts/security-findings-scan.mjs [--json]
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
// eslint-disable-next-line import/no-unresolved
import { lintMigrations } from "./supabase-lint-check.mjs";
// eslint-disable-next-line import/no-unresolved
import { auditAll } from "./supabase-authz-check.mjs";
// eslint-disable-next-line import/no-unresolved
import { loadAllowlist, applyAllowlist, ALLOWLIST_PATH } from "./security-allowlist.mjs";

const ROOT = process.cwd();
const SRC = join(ROOT, "src");

/** All server-function modules in the app. */
function serverFnFiles(dir = SRC, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      serverFnFiles(full, out);
    } else if (/\.(functions|server)\.tsx?$/.test(entry) || full.includes(`${join("routes", "api")}`)) {
      out.push(full);
    }
  }
  return out;
}

const QUOTE_HINT = /(0x\.org|swap\/allowance-holder|aggregator|getSwapQuote|\/quote)/i;

/** Finding: open_dex_quote. */
export function checkOpenDexQuote() {
  const errors = [];
  const dexPath = join(SRC, "lib", "dex.functions.ts");
  let dex = "";
  try {
    dex = readFileSync(dexPath, "utf8");
  } catch {
    errors.push("src/lib/dex.functions.ts is missing — the authenticated quote path cannot be verified.");
    return { id: "open_dex_quote", errors };
  }

  if (!/\.middleware\(\[\s*requireSupabaseAuth\s*\]\)/.test(dex)) {
    errors.push("getSwapQuote no longer applies the requireSupabaseAuth middleware — the endpoint is public.");
  }
  if (!/checkQuoteRateLimit\s*\(\s*context\.userId\s*\)/.test(dex)) {
    errors.push("getSwapQuote no longer rate-limits per authenticated user (checkQuoteRateLimit(context.userId)).");
  }
  const rlIdx = dex.indexOf("checkQuoteRateLimit(");
  const fetchIdx = dex.search(/fetch\s*\(/);
  if (rlIdx === -1 || (fetchIdx !== -1 && fetchIdx < rlIdx)) {
    errors.push("getSwapQuote calls the upstream aggregator before the rate-limit check runs.");
  }

  // Any other server fn touching a quote/aggregator endpoint must be authed.
  for (const file of serverFnFiles()) {
    const src = readFileSync(file, "utf8");
    if (!src.includes("createServerFn") || !QUOTE_HINT.test(src)) continue;
    if (!src.includes("requireSupabaseAuth")) {
      errors.push(
        `${relative(ROOT, file)} defines a quote/aggregator server function without requireSupabaseAuth.`,
      );
    }
  }

  return { id: "open_dex_quote", errors };
}

/** Finding: SUPA_function_search_path_mutable. */
export function checkMutableSearchPath() {
  const lint = lintMigrations();
  const errors = lint.errors.filter((e) => /search_path/i.test(e));
  return { id: "SUPA_function_search_path_mutable", errors, functionsChecked: lint.functionsChecked };
}

function main() {
  const gated = [checkOpenDexQuote(), checkMutableSearchPath()];

  // Advisory: the rest of the security analysis still runs, but never fails CI.
  const lint = lintMigrations();
  const authz = auditAll();
  const advisory = [
    ...lint.errors.filter((e) => !/search_path/i.test(e)),
    ...(lint.warnings ?? []),
    ...authz.errors,
  ];

  // Configurable allowlist: track/explain advisory findings without gating them.
  const triage = applyAllowlist(advisory, loadAllowlist());

  const failed = gated.filter((g) => g.errors.length > 0);
  const ok = failed.length === 0 && triage.configErrors.length === 0;
  const report = {
    ok,
    gatedFindings: gated.map((g) => ({ id: g.id, reappeared: g.errors.length > 0, errors: g.errors })),
    advisory,
    allowlist: {
      path: ALLOWLIST_PATH,
      acknowledged: triage.acknowledged,
      unacknowledged: triage.unacknowledged,
      expired: triage.expired,
      unusedEntries: triage.unusedEntries,
      configErrors: triage.configErrors,
    },
  };

  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log("Security finding gate — open_dex_quote, SUPA_function_search_path_mutable\n");
    for (const g of gated) {
      if (g.errors.length === 0) {
        console.log(`  PASS  ${g.id} did not reappear`);
      } else {
        console.log(`  FAIL  ${g.id} reappeared:`);
        for (const e of g.errors) console.log(`          - ${e}`);
      }
    }
    if (triage.configErrors.length) {
      console.log(`\n  FAIL  ${ALLOWLIST_PATH} is invalid:`);
      for (const e of triage.configErrors) console.log(`          - ${e}`);
    }
    if (triage.acknowledged.length) {
      console.log(`\n  Acknowledged via ${ALLOWLIST_PATH} (${triage.acknowledged.length} item(s)):`);
      for (const a of triage.acknowledged) {
        const until = a.expires ? `, expires ${a.expires}` : "";
        console.log(`    - [${a.id}] ${a.message}`);
        console.log(`        reason: ${a.reason} (owner: ${a.owner}${until})`);
      }
    }
    if (triage.expired.length) {
      console.log(`\n  Expired allowlist entries (re-review or renew):`);
      for (const e of triage.expired) console.log(`    - ${e.id} expired ${e.expires} (owner: ${e.owner})`);
    }
    if (triage.unusedEntries.length) {
      console.log(`\n  Stale allowlist entries matching nothing: ${triage.unusedEntries.join(", ")}`);
    }
    if (triage.unacknowledged.length) {
      console.log(`\n  Advisory, not acknowledged (not gated, ${triage.unacknowledged.length} item(s)):`);
      for (const a of triage.unacknowledged) console.log(`    - ${a}`);
    }
  }

  process.exit(ok ? 0 : 1);
}

const isMain = process.argv[1] && process.argv[1].endsWith("security-findings-scan.mjs");
if (isMain) main();
