#!/usr/bin/env node
/**
 * Supabase security lint — CI guard.
 *
 * Static analysis of supabase/migrations/*.sql that fails the build when a
 * change would regress one of the two classes of finding we have already
 * fixed by hand:
 *
 *   1. SECURITY DEFINER functions that are missing `SET search_path` or that
 *      are still executable by PUBLIC / anon (privilege escalation surface).
 *   2. Storage buckets created as public, or storage.objects policies that are
 *      not scoped to the owning user (bucket-wide data exposure).
 *
 * Optionally also runs the live Postgres linter when SUPABASE_DB_URL is set
 * (`--live`), so a drifted database is caught too.
 *
 * Usage:  node scripts/supabase-lint-check.mjs [--live] [--json]
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations");

/**
 * Trigger functions cannot be invoked directly by a client, so a REVOKE is not
 * required for them. They still must pin `search_path`.
 */
const REVOKE_EXEMPT_RETURN_TYPES = new Set(["trigger"]);

/**
 * Functions intentionally callable by signed-in users. They must still be
 * revoked from PUBLIC/anon; this list only documents the intent.
 */
const AUTHENTICATED_CALLABLE = new Set([
  "consume_credits",
  "has_role",
  "mcp_my_limits",
  "mcp_rate_limit_status",
  "mcp_set_rate_limits",
  "mcp_set_agent_rate_limit",
  "my_referral_reward_months",
  "has_active_subscription",
  "ensure_credit_account",
]);

const PRIVATE_BUCKET_PREFIXES = ["threat-reports", "database_export"];
const isPrivateBucket = (id) => PRIVATE_BUCKET_PREFIXES.some((p) => id.startsWith(p));

function loadMigrations() {
  let files;
  try {
    files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql"));
  } catch {
    return [];
  }
  return files
    .sort()
    .map((name) => ({ name, sql: readFileSync(join(MIGRATIONS_DIR, name), "utf8") }));
}

/** Split a SQL file into top-level-ish statements, keeping $$ bodies intact. */
function splitFunctions(sql) {
  const out = [];
  const re =
    /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:public\.)?"?([a-z0-9_]+)"?\s*\(([^)]*)\)([\s\S]*?)\$function\$|CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:public\.)?"?([a-z0-9_]+)"?\s*\(([^)]*)\)([\s\S]*?)\$\$/gi;
  let m;
  while ((m = re.exec(sql)) !== null) {
    const name = m[1] ?? m[4];
    const args = m[2] ?? m[5] ?? "";
    const header = m[3] ?? m[6] ?? "";
    out.push({ name, args, header });
  }
  return out;
}

export function lintMigrations(migrations = loadMigrations()) {
  const errors = [];
  const warnings = [];
  const allSql = migrations.map((m) => m.sql).join("\n");

  // Latest definition of each function wins (migrations are applied in order).
  const latest = new Map();
  for (const { name: file, sql } of migrations) {
    for (const fn of splitFunctions(sql)) {
      latest.set(fn.name, { ...fn, file });
    }
  }

  for (const [name, fn] of latest) {
    const isDefiner = /SECURITY\s+DEFINER/i.test(fn.header);
    if (!isDefiner) continue;

    if (!/SET\s+search_path\s*(?:TO|=)/i.test(fn.header)) {
      errors.push(
        `SECURITY DEFINER function public.${name} (${fn.file}) does not pin \`SET search_path\`.`,
      );
    }

    const returnsMatch = /RETURNS\s+([a-z_ ]+)/i.exec(fn.header);
    const returns = returnsMatch ? returnsMatch[1].trim().toLowerCase() : "";
    if (REVOKE_EXEMPT_RETURN_TYPES.has(returns)) continue;

    const revokeRe = new RegExp(
      `REVOKE\\s+(?:ALL|EXECUTE)[^;]*ON\\s+FUNCTION\\s+public\\.${name}\\s*\\([^;]*?FROM[^;]*;`,
      "gis",
    );
    const revokes = allSql.match(revokeRe) ?? [];
    const revokesPublic = revokes.some((r) => /\bPUBLIC\b/i.test(r));
    const revokesAnon = revokes.some((r) => /\banon\b/i.test(r));

    if (!revokes.length) {
      errors.push(
        `SECURITY DEFINER function public.${name} (${fn.file}) has no REVOKE statement — it is executable by PUBLIC.`,
      );
    } else if (!revokesPublic || !revokesAnon) {
      errors.push(
        `SECURITY DEFINER function public.${name} must be revoked from both PUBLIC and anon (found: ${revokes
          .map((r) => r.replace(/\s+/g, " ").trim())
          .join(" | ")}).`,
      );
    } else if (!AUTHENTICATED_CALLABLE.has(name) && !/\bauthenticated\b/i.test(revokes.join(" "))) {
      warnings.push(
        `SECURITY DEFINER function public.${name} is still executable by \`authenticated\` and is not in the AUTHENTICATED_CALLABLE allowlist.`,
      );
    }
  }

  // ---- Storage checks -----------------------------------------------------
  const bucketInserts = [
    ...allSql.matchAll(
      /INSERT\s+INTO\s+storage\.buckets[\s\S]*?VALUES\s*\(([\s\S]*?)\)\s*(?:ON\s+CONFLICT[^;]*)?;/gi,
    ),
  ];
  for (const [, values] of bucketInserts) {
    if (/\btrue\b/i.test(values)) {
      const bucket = /'([^']+)'/.exec(values)?.[1] ?? "unknown";
      if (isPrivateBucket(bucket)) {
        errors.push(`Storage bucket "${bucket}" must stay private (public = false).`);
      }
    }
  }

  const storagePolicies = [
    ...allSql.matchAll(
      /CREATE\s+POLICY\s+"([^"]+)"\s+ON\s+storage\.objects([^;]*);/gi,
    ),
  ];
  for (const [, policyName, body] of storagePolicies) {
    const bucketMatch = /bucket_id\s*=\s*'([^']+)'/i.exec(body);
    if (!bucketMatch) {
      errors.push(
        `storage.objects policy "${policyName}" does not constrain \`bucket_id\` — it applies to every bucket.`,
      );
      continue;
    }
    if (!isPrivateBucket(bucketMatch[1])) continue;
    const ownerScoped =
      /auth\.uid\(\)/i.test(body) &&
      (/owner/i.test(body) ||
        /storage\.foldername/i.test(body) ||
        /name\s+LIKE/i.test(body) ||
        /has_role\s*\(/i.test(body));
    if (!ownerScoped) {
      errors.push(
        `storage.objects policy "${policyName}" on private bucket "${bucketMatch[1]}" is not scoped to the owning user (needs auth.uid() ownership/prefix check).`,
      );
    }
  }

  for (const bucket of PRIVATE_BUCKET_PREFIXES) {
    const referenced = storagePolicies.some(([, , body]) =>
      new RegExp(`bucket_id\\s*=\\s*'${bucket}`, "i").test(body),
    );
    if (!referenced && new RegExp(`'${bucket}`).test(allSql)) {
      errors.push(`Private bucket "${bucket}" has no storage.objects RLS policy.`);
    }
  }

  return { errors, warnings, functionsChecked: latest.size };
}

/** Optional live check against the running database. */
function lintLive() {
  const url = process.env.SUPABASE_DB_URL;
  if (!url) return { errors: [], warnings: ["--live requested but SUPABASE_DB_URL is not set."] };
  const sql = `
    select 'definer_no_search_path: ' || p.proname
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prosecdef
       and (p.proconfig is null or not exists (
             select 1 from unnest(p.proconfig) c where c like 'search_path=%'))
    union all
    select 'definer_public_execute: ' || p.proname
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prosecdef
       and (has_function_privilege('public', p.oid, 'execute')
         or has_function_privilege('anon', p.oid, 'execute'))
    union all
    select 'storage_rls_disabled'
      from pg_class where oid = 'storage.objects'::regclass and not relrowsecurity;`;
  try {
    const out = execFileSync("psql", [url, "-Atqc", sql], { encoding: "utf8" }).trim();
    return { errors: out ? out.split("\n").filter(Boolean) : [], warnings: [] };
  } catch (e) {
    return { errors: [], warnings: [`Live linter could not run: ${e.message}`] };
  }
}

const isMain = process.argv[1] && process.argv[1].endsWith("supabase-lint-check.mjs");
if (isMain) {
  const live = process.argv.includes("--live");
  const result = lintMigrations();
  if (live) {
    const l = lintLive();
    result.errors.push(...l.errors);
    result.warnings.push(...l.warnings);
  }
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`Supabase security lint — ${result.functionsChecked} functions analysed`);
    for (const w of result.warnings) console.log(`  warn  ${w}`);
    for (const e of result.errors) console.log(`  FAIL  ${e}`);
    if (!result.errors.length) console.log("  OK    no SECURITY DEFINER or storage RLS regressions");
  }
  process.exit(result.errors.length ? 1 : 0);
}
