import { describe, expect, it } from "vitest";
// @ts-expect-error - plain ESM script without type declarations
import {
  auditCrossUserExecute,
  auditStoragePolicies,
  resolveExecuteGrants,
  loadMigrations,
} from "../../../scripts/supabase-authz-check.mjs";

type Migration = { name: string; sql: string };
type Audit = { errors: string[] };

const real = loadMigrations() as Migration[];
const mig = (sql: string): Migration[] => [{ name: "test.sql", sql }];

describe("cross-user SECURITY DEFINER execution", () => {
  it("finds the migration history", () => {
    expect(real.length).toBeGreaterThan(0);
  });

  it("has no definer function a signed-in user can run for another account", () => {
    const result = auditCrossUserExecute(real) as Audit & { checked: string[] };
    expect(result.errors).toEqual([]);
    expect(result.checked.length).toBeGreaterThan(0);
  });

  it("resolves effective EXECUTE grants (internal helpers stay server-only)", () => {
    const grants = resolveExecuteGrants(real) as Map<string, Set<string>>;
    // Internal helpers must not be reachable by signed-in users.
    for (const internal of [
      "mcp_effective_limits",
      "mcp_begin_call",
      "mcp_finish_call",
      "grant_credits",
      "ensure_credit_account",
      "process_referral_rewards",
    ]) {
      const roles = grants.get(internal);
      expect(roles, `${internal} should have grants recorded`).toBeTruthy();
      expect([...(roles ?? [])], `${internal} must not be callable by clients`).not.toContain(
        "authenticated",
      );
      expect([...(roles ?? [])]).not.toContain("anon");
      expect([...(roles ?? [])]).not.toContain("public");
    }
    // The self-scoped replacement is the one users may call.
    expect([...(grants.get("mcp_my_limits") ?? [])]).toContain("authenticated");
  });

  it("rejects a definer function that trusts a caller-supplied user id", () => {
    const bad = mig(`
      CREATE OR REPLACE FUNCTION public.leaky_report(_user_id uuid)
      RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
      AS $$ SELECT to_jsonb(c) FROM public.credit_balances c WHERE c.user_id = _user_id $$;
      GRANT EXECUTE ON FUNCTION public.leaky_report(uuid) TO authenticated;
    `);
    const result = auditCrossUserExecute(bad) as Audit;
    expect(result.errors.join("\n")).toMatch(/leaky_report/);
  });

  it("accepts the same function once the caller is verified against auth.uid()", () => {
    const good = mig(`
      CREATE OR REPLACE FUNCTION public.safe_report(_user_id uuid)
      RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
      AS $$
      DECLARE caller uuid := auth.uid();
      BEGIN
        IF caller IS NULL OR _user_id <> caller THEN
          RETURN jsonb_build_object('error','forbidden');
        END IF;
        RETURN jsonb_build_object('ok', true);
      END; $$;
      GRANT EXECUTE ON FUNCTION public.safe_report(uuid) TO authenticated;
    `);
    expect((auditCrossUserExecute(good) as Audit).errors).toEqual([]);
  });

  it("accepts an unguarded helper when it is revoked from signed-in users", () => {
    const revoked = mig(`
      CREATE OR REPLACE FUNCTION public.internal_helper(_user_id uuid)
      RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path TO 'public'
      AS $$ SELECT 1 $$;
      REVOKE ALL ON FUNCTION public.internal_helper(uuid) FROM PUBLIC, anon, authenticated;
      GRANT EXECUTE ON FUNCTION public.internal_helper(uuid) TO service_role;
    `);
    expect((auditCrossUserExecute(revoked) as Audit).errors).toEqual([]);
  });

  it("treats a later GRANT to authenticated as a regression", () => {
    const regressed = mig(`
      CREATE OR REPLACE FUNCTION public.internal_helper(_user_id uuid)
      RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path TO 'public'
      AS $$ SELECT 1 $$;
      REVOKE ALL ON FUNCTION public.internal_helper(uuid) FROM PUBLIC, anon, authenticated;
      GRANT EXECUTE ON FUNCTION public.internal_helper(uuid) TO authenticated;
    `);
    expect((auditCrossUserExecute(regressed) as Audit).errors.join("\n")).toMatch(
      /internal_helper/,
    );
  });
});

describe("storage.objects bucket and path scoping", () => {
  it("every live policy pins its bucket and scopes access correctly", () => {
    const result = auditStoragePolicies(real) as Audit & { policies: unknown[] };
    expect(result.errors).toEqual([]);
    expect(result.policies.length).toBeGreaterThan(0);
  });

  it("threat-reports is owner-path scoped for read and write", () => {
    const { policies } = auditStoragePolicies(real) as {
      policies: { pname: string; cmd: string; using: string; check: string; rest: string }[];
    };
    const own = policies.filter((p) => p.rest.includes("'threat-reports'"));
    expect(own.map((p) => p.cmd).sort()).toEqual(["DELETE", "INSERT", "SELECT", "UPDATE"]);
    for (const p of own) {
      const expr = `${p.using}${p.check}`;
      expect(expr, `${p.pname} must bind the first path segment to auth.uid()`).toMatch(
        /storage\.foldername\s*\(\s*name\s*\)\s*\)?\s*\[\s*1\s*\]\s*=\s*auth\.uid\(\)::text/i,
      );
    }
  });

  it("database_export bucket is admin-read-only", () => {
    const { policies } = auditStoragePolicies(real) as {
      policies: { cmd: string; using: string; rest: string }[];
    };
    const own = policies.filter((p) => p.rest.includes("database_export_28_07_26"));
    expect(own.length).toBeGreaterThan(0);
    expect(own.every((p) => p.cmd === "SELECT")).toBe(true);
    expect(own.every((p) => /has_role\s*\(\s*auth\.uid\(\)/i.test(p.using))).toBe(true);
  });

  it("rejects a policy that does not pin bucket_id", () => {
    const bad = mig(`
      CREATE POLICY "any_bucket_read" ON storage.objects FOR SELECT TO authenticated
        USING ((storage.foldername(name))[1] = auth.uid()::text);
    `);
    expect((auditStoragePolicies(bad) as Audit).errors.join("\n")).toMatch(/bucket_id/);
  });

  it("rejects a bucket-wide read of a private bucket", () => {
    const bad = mig(`
      CREATE POLICY "threat_reports_open" ON storage.objects FOR SELECT TO authenticated
        USING (bucket_id = 'threat-reports');
    `);
    expect((auditStoragePolicies(bad) as Audit).errors.join("\n")).toMatch(/USING/);
  });

  it("rejects an insert policy whose WITH CHECK is unscoped", () => {
    const bad = mig(`
      CREATE POLICY "threat_reports_write" ON storage.objects FOR INSERT TO authenticated
        WITH CHECK (bucket_id = 'threat-reports');
    `);
    expect((auditStoragePolicies(bad) as Audit).errors.join("\n")).toMatch(/WITH CHECK/);
  });

  it("rejects anon access to a private bucket", () => {
    const bad = mig(`
      CREATE POLICY "threat_reports_anon" ON storage.objects FOR SELECT TO anon
        USING (bucket_id = 'threat-reports' AND (storage.foldername(name))[1] = auth.uid()::text);
    `);
    expect((auditStoragePolicies(bad) as Audit).errors.join("\n")).toMatch(/anon/);
  });

  it("rejects client writes to the admin-only export bucket", () => {
    const bad = mig(`
      CREATE POLICY "export_write" ON storage.objects FOR INSERT TO authenticated
        WITH CHECK (bucket_id = 'database_export_28_07_26' AND public.has_role(auth.uid(), 'admin'));
    `);
    expect((auditStoragePolicies(bad) as Audit).errors.join("\n")).toMatch(/not an allowed command/);
  });

  it("accepts the correct owner-scoped policy shape", () => {
    const good = mig(`
      CREATE POLICY "threat_reports_owner_select" ON storage.objects FOR SELECT TO authenticated
        USING (bucket_id = 'threat-reports' AND (storage.foldername(name))[1] = auth.uid()::text);
      CREATE POLICY "threat_reports_owner_insert" ON storage.objects FOR INSERT TO authenticated
        WITH CHECK (bucket_id = 'threat-reports' AND (storage.foldername(name))[1] = auth.uid()::text);
      CREATE POLICY "threat_reports_owner_update" ON storage.objects FOR UPDATE TO authenticated
        USING (bucket_id = 'threat-reports' AND (storage.foldername(name))[1] = auth.uid()::text)
        WITH CHECK (bucket_id = 'threat-reports' AND (storage.foldername(name))[1] = auth.uid()::text);
      CREATE POLICY "threat_reports_owner_delete" ON storage.objects FOR DELETE TO authenticated
        USING (bucket_id = 'threat-reports' AND (storage.foldername(name))[1] = auth.uid()::text);
    `);
    expect((auditStoragePolicies(good) as Audit).errors).toEqual([]);
  });
});
