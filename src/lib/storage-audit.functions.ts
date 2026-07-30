import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdmin } from "@/lib/admin-guard";

export type StorageAuditRow = {
  id: string;
  user_id: string | null;
  bucket: string;
  object_path: string;
  operation: string;
  decision: string;
  reason: string | null;
  path_owner_id: string | null;
  correlation_id: string | null;
  created_at: string;
};

export type StorageAuditFilter = {
  /** Lookback window in hours (1 – 720). */
  hours?: number;
  bucket?: string;
  decision?: "allow" | "deny" | "all";
  /** Free-text match against object path / user id / correlation id. */
  q?: string;
  limit?: number;
};

/**
 * Recent object-storage access attempts. Admin-only: the audit trail exposes
 * other users' folder paths, so the caller's role is verified with their own
 * client before the service-role read.
 */
export const getStorageAccessAudit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: StorageAuditFilter): Required<StorageAuditFilter> => ({
    hours: Math.min(Math.max(Number(input?.hours ?? 24), 1), 720),
    bucket: String(input?.bucket ?? "all").slice(0, 64),
    decision:
      input?.decision === "allow" || input?.decision === "deny" ? input.decision : "all",
    q: String(input?.q ?? "").slice(0, 120),
    limit: Math.min(Math.max(Number(input?.limit ?? 200), 1), 500),
  }))
  .handler(async ({ data, context }): Promise<StorageAuditRow[]> => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const since = new Date(Date.now() - data.hours * 3600_000).toISOString();
    let q = supabaseAdmin
      .from("storage_access_audit")
      .select(
        "id,user_id,bucket,object_path,operation,decision,reason,path_owner_id,correlation_id,created_at",
      )
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(data.limit);

    if (data.bucket !== "all") q = q.eq("bucket", data.bucket);
    if (data.decision !== "all") q = q.eq("decision", data.decision);
    if (data.q) {
      const term = data.q.replace(/[%,()]/g, "");
      q = q.or(
        `object_path.ilike.%${term}%,correlation_id.ilike.%${term}%,reason.ilike.%${term}%`,
      );
    }

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return (rows ?? []) as StorageAuditRow[];
  });

export type StorageAlertRow = {
  id: string;
  rule: "deny_spike" | "owner_mismatch";
  severity: "info" | "warning" | "critical";
  bucket: string;
  path_pattern: string;
  window_start: string;
  window_minutes: number;
  event_count: number;
  distinct_users: number;
  threshold: number;
  message: string;
  sample: { object_path?: string | null; reason?: string | null; caller?: string | null } | null;
  acknowledged_at: string | null;
  acknowledged_by: string | null;
  created_at: string;
};

type AlertQuery = { hours?: number; includeAcknowledged?: boolean; evaluate?: boolean };

/**
 * Admin view of storage-security alerts (denial spikes, repeated owner
 * mismatches). Optionally re-runs detection over the recent audit trail first.
 */
export const getStorageAlerts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: AlertQuery) => ({
    hours: Math.min(Math.max(Number(input?.hours ?? 168), 1), 720),
    includeAcknowledged: input?.includeAcknowledged === true,
    evaluate: input?.evaluate !== false,
  }))
  .handler(async ({ data, context }): Promise<StorageAlertRow[]> => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    if (data.evaluate) {
      const { error } = await supabaseAdmin.rpc("evaluate_storage_audit_alerts", {
        _window_minutes: 15,
        _deny_threshold: 10,
        _mismatch_threshold: 3,
      });
      if (error) console.error("[storage-alerts] evaluate failed", error.message);
    }

    let q = supabaseAdmin
      .from("storage_audit_alerts")
      .select("*")
      .gte("created_at", new Date(Date.now() - data.hours * 3600_000).toISOString())
      .order("created_at", { ascending: false })
      .limit(200);
    if (!data.includeAcknowledged) q = q.is("acknowledged_at", null);

    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return (rows ?? []) as StorageAlertRow[];
  });

/** Admin acknowledges an alert; the audit rows themselves stay untouched. */
export const acknowledgeStorageAlert = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) => ({ id: String(input?.id ?? "").slice(0, 64) }))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    await assertAdmin(context.supabase, context.userId);
    const { error } = await (context.supabase as unknown as {
      from: (t: string) => {
        update: (v: Record<string, unknown>) => {
          eq: (c: string, v: string) => Promise<{ error: { message: string } | null }>;
        };
      };
    })
      .from("storage_audit_alerts")
      .update({ acknowledged_at: new Date().toISOString(), acknowledged_by: context.userId })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
