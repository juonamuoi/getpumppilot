#!/usr/bin/env node
/**
 * Supabase authorization regression checks.
 *
 * Complements scripts/supabase-lint-check.mjs with two focused audits:
 *
 *   1. Cross-user SECURITY DEFINER execution.
 *      A definer function that is executable by `authenticated` and accepts a
 *      user identifier argument (uuid named *user_id* / _uid) must not trust
 *      that argument: it has to either derive the identity from auth.uid() or
 *      explicitly reject a mismatch. Otherwise any signed-in user can run it
 *      on behalf of somebody else.
 *
 *   2. storage.objects policy scoping.
 *      Every policy must pin a single bucket_id, target concrete roles, and —
 *      for private buckets — scope rows by path prefix (`storage.foldername`
 *      / owner) or by an admin role check. INSERT/UPDATE policies must carry
 *      the same constraint in WITH CHECK, not only USING.
 *
 * Usage: node scripts/supabase-authz-check.mjs [--json]
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations");

/** Private buckets and how they are allowed to be scoped. */
export const PRIVATE_BUCKETS = {
  "threat-reports": { scope: "path", commands: ["SELECT", "INSERT", "UPDATE", "DELETE"] },
  database_export_28_07_26: { scope: "role", commands: ["SELECT"] },
};

/**
 * Definer functions that legitimately take another user's id while being
 * callable by signed-in users. Each entry documents why it is safe.
 */
export const CROSS_USER_ALLOWLIST = new Map([
  // Boolean role probe; leaks nothing beyond "does this user have this role",
  // and is the canonical Supabase RLS helper.
  ["has_role", "boolean role probe used inside RLS policies"],
]);

export function loadMigrations(dir = MIGRATIONS_DIR) {
  let files;
  try {
    files = readdirSync(dir).filter((f) => f.endsWith(".sql"));
  } catch {
    return [];
  }
  return files
    .sort()
    .map((name) => ({ name, sql: readFileSync(join(dir, name), "utf8") }));
}

/** Parse every CREATE FUNCTION with its full body. */
function parseFunctions(sql) {
  const out = [];
  const re =
    /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:public\.)?"?([a-z0-9_]+)"?\s*\(([\s\S]*?)\)\s*([\s\S]*?)AS\s+(\$[a-z_]*\$)([\s\S]*?)\4/gi;
  let m;
  while ((m = re.exec(sql)) !== null) {
    out.push({ name: m[1], args: m[2], header: m[3], body: m[5] });
  }
  return out;
}

const ROLE_LIST = (s) =>
  s
    .split(",")
    .map((r) => r.trim().replace(/;$/, "").toLowerCase())
    .filter(Boolean);

/**
 * Resolve which roles can EXECUTE each function after all migrations ran.
 * Keyed by function name (overloads are merged, which is the safe direction).
 */
export function resolveExecuteGrants(migrations) {
  const grants = new Map(); // name -> Set(roles)
  const ensure = (n) => {
    if (!grants.has(n)) grants.set(n, new Set(["public"]));
    return grants.get(n);
  };

  for (const { sql } of migrations) {
    const stmts = [
      ...sql.matchAll(
        /(GRANT|REVOKE)\s+(?:ALL(?:\s+PRIVILEGES)?|EXECUTE)\s+ON\s+FUNCTION\s+(?:public\.)?"?([a-z0-9_]+)"?\s*\([^)]*\)\s*(?:TO|FROM)\s+([^;]+);/gi,
      ),
    ];
    for (const [, verb, name, roles] of stmts) {
      const set = ensure(name);
      for (const role of ROLE_LIST(roles)) {
        if (verb.toUpperCase() === "GRANT") set.add(role);
        else {
          set.delete(role);
          // Revoking PUBLIC removes the implicit grant everyone inherits.
          if (role === "public") {
            set.delete("anon");
            set.delete("authenticated");
          }
        }
      }
    }
  }
  return grants;
}

const callableByAuthenticated = (roles) =>
  roles.has("authenticated") || roles.has("public");

/** Audit 1 — cross-user SECURITY DEFINER execution. */
export function auditCrossUserExecute(migrations = loadMigrations()) {
  const errors = [];
  const checked = [];

  const latest = new Map();
  for (const { name: file, sql } of migrations) {
    for (const fn of parseFunctions(sql)) latest.set(fn.name, { ...fn, file });
  }
  const grants = resolveExecuteGrants(migrations);

  for (const [name, fn] of latest) {
    if (!/SECURITY\s+DEFINER/i.test(fn.header)) continue;
    const roles = grants.get(name) ?? new Set(["public"]);
    if (!callableByAuthenticated(roles)) continue;

    const userArg = /(?:^|,)\s*(_?[a-z0-9_]*(?:user_id|uid|user_uuid))\s+uuid/i.exec(fn.args);
    if (!userArg) continue;

    checked.push(name);
    if (CROSS_USER_ALLOWLIST.has(name)) continue;

    const arg = userArg[1];
    const body = fn.body;
    const usesAuthUid = /auth\.uid\(\)/i.test(body);
    // Either the caller identity replaces the argument, or the argument is
    // compared against auth.uid() and rejected on mismatch.
    const comparesArg = new RegExp(
      `(auth\\.uid\\(\\)[^;]{0,80}(=|<>|IS\\s+DISTINCT\\s+FROM)[^;]{0,80}${arg}` +
        `|${arg}[^;]{0,80}(=|<>|IS\\s+DISTINCT\\s+FROM)[^;]{0,80}auth\\.uid\\(\\)` +
        `|caller[^;]{0,80}(=|<>|IS\\s+DISTINCT\\s+FROM)[^;]{0,80}${arg}` +
        `|${arg}[^;]{0,80}(=|<>|IS\\s+DISTINCT\\s+FROM)[^;]{0,80}caller)`,
      "is",
    ).test(body);

    if (!usesAuthUid || !comparesArg) {
      errors.push(
        `SECURITY DEFINER function public.${name}(${arg} uuid) in ${fn.file} is executable by ` +
          `signed-in users but never checks \`${arg}\` against auth.uid() — a signed-in user ` +
          `could run it for another account. Revoke EXECUTE from authenticated, derive the id ` +
          `from auth.uid(), or reject the mismatch.`,
      );
    }
  }

  return { errors, checked };
}

const PATH_SCOPED = /storage\.foldername\s*\(\s*name\s*\)\s*\)?\s*\[\s*1\s*\]\s*=\s*auth\.uid\(\)\s*::\s*text/i;
const OWNER_SCOPED = /owner\s*=\s*auth\.uid\(\)/i;
const ROLE_SCOPED = /has_role\s*\(\s*auth\.uid\(\)/i;

function parseStoragePolicies(migrations) {
  const policies = new Map(); // name -> policy (later definitions win)
  const dropped = new Set();
  for (const { name: file, sql } of migrations) {
    for (const [, pname] of sql.matchAll(
      /DROP\s+POLICY\s+(?:IF\s+EXISTS\s+)?"([^"]+)"\s+ON\s+storage\.objects\s*;/gi,
    )) {
      dropped.add(pname);
    }
    for (const m of sql.matchAll(
      /CREATE\s+POLICY\s+"([^"]+)"\s+ON\s+storage\.objects([\s\S]*?);/gi,
    )) {
      const [, pname, rest] = m;
      const cmd = (/\bFOR\s+(ALL|SELECT|INSERT|UPDATE|DELETE)\b/i.exec(rest)?.[1] ?? "ALL").toUpperCase();
      const roles = ROLE_LIST(/\bTO\s+([a-z_, ]+?)(?:\s+USING|\s+WITH|\s*$)/i.exec(rest)?.[1] ?? "");
      const usingIdx = rest.search(/\bUSING\s*\(/i);
      const checkIdx = rest.search(/\bWITH\s+CHECK\s*\(/i);
      const using = usingIdx === -1 ? "" : rest.slice(usingIdx, checkIdx === -1 ? undefined : checkIdx);
      const check = checkIdx === -1 ? "" : rest.slice(checkIdx);
      policies.set(pname, { pname, file, cmd, roles, using, check, rest });
      dropped.delete(pname);
    }
  }
  for (const name of dropped) policies.delete(name);
  return [...policies.values()];
}

/** Audit 2 — storage.objects bucket + path scoping. */
export function auditStoragePolicies(migrations = loadMigrations()) {
  const errors = [];
  const policies = parseStoragePolicies(migrations);

  for (const p of policies) {
    const buckets = [...p.rest.matchAll(/bucket_id\s*=\s*'([^']+)'/gi)].map((m) => m[1]);
    const unique = [...new Set(buckets)];
    if (unique.length === 0) {
      errors.push(
        `storage.objects policy "${p.pname}" (${p.file}) does not pin a bucket_id — it applies to every bucket.`,
      );
      continue;
    }
    if (unique.length > 1) {
      errors.push(
        `storage.objects policy "${p.pname}" (${p.file}) spans multiple buckets (${unique.join(", ")}); write one policy per bucket.`,
      );
    }
    const bucket = unique[0];
    const spec = PRIVATE_BUCKETS[bucket];
    if (!spec) continue;

    if (p.roles.includes("anon") || p.roles.includes("public") || p.roles.length === 0) {
      errors.push(
        `storage.objects policy "${p.pname}" on private bucket "${bucket}" must target concrete roles (TO authenticated), not anon/public.`,
      );
    }

    const scoped = (expr) =>
      spec.scope === "role" ? ROLE_SCOPED.test(expr) : PATH_SCOPED.test(expr) || OWNER_SCOPED.test(expr);
    const need = spec.scope === "role" ? "an admin has_role(auth.uid(), …) check" : "a path/owner check bound to auth.uid()";

    const wantsUsing = ["SELECT", "UPDATE", "DELETE", "ALL"].includes(p.cmd);
    const wantsCheck = ["INSERT", "UPDATE", "ALL"].includes(p.cmd);

    if (wantsUsing && !scoped(p.using)) {
      errors.push(
        `storage.objects policy "${p.pname}" (${p.cmd} on "${bucket}") is missing ${need} in USING — rows from other users are readable.`,
      );
    }
    if (wantsCheck && !scoped(p.check)) {
      errors.push(
        `storage.objects policy "${p.pname}" (${p.cmd} on "${bucket}") is missing ${need} in WITH CHECK — files could be written outside the caller's prefix.`,
      );
    }
    if (!spec.commands.includes(p.cmd) && p.cmd !== "ALL") {
      errors.push(
        `storage.objects policy "${p.pname}" grants ${p.cmd} on "${bucket}", which is not an allowed command (${spec.commands.join(", ")}).`,
      );
    }
  }

  // Every private bucket must actually be covered.
  const allSql = migrations.map((m) => m.sql).join("\n");
  for (const [bucket, spec] of Object.entries(PRIVATE_BUCKETS)) {
    if (!allSql.includes(bucket)) continue;
    for (const cmd of spec.commands) {
      const covered = policies.some(
        (p) =>
          new RegExp(`bucket_id\\s*=\\s*'${bucket}'`, "i").test(p.rest) &&
          (p.cmd === cmd || p.cmd === "ALL"),
      );
      if (!covered) {
        errors.push(`Private bucket "${bucket}" has no ${cmd} policy on storage.objects.`);
      }
    }
  }

  return { errors, policies };
}

export function auditAll(migrations = loadMigrations()) {
  const fns = auditCrossUserExecute(migrations);
  const storage = auditStoragePolicies(migrations);
  return {
    errors: [...fns.errors, ...storage.errors],
    functionsChecked: fns.checked,
    policiesChecked: storage.policies.length,
  };
}

const isMain = process.argv[1] && process.argv[1].endsWith("supabase-authz-check.mjs");
if (isMain) {
  const result = auditAll();
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(
      `Supabase authz check — ${result.functionsChecked.length} cross-user definer candidates, ${result.policiesChecked} storage policies`,
    );
    for (const e of result.errors) console.log(`  FAIL  ${e}`);
    if (!result.errors.length) console.log("  OK    no cross-user execute or storage scoping regressions");
  }
  process.exit(result.errors.length ? 1 : 0);
}
