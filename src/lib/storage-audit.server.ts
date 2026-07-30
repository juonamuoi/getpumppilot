/**
 * Server-only audit trail for object-storage access attempts.
 *
 * Every read/write against a private bucket is recorded with the acting user,
 * the object path, the owner segment of that path and an allow/deny outcome.
 * Rows are written with the service-role client (RLS blocks client inserts) and
 * are readable by the owning user or an admin.
 */

export type StorageOperation = "upload" | "sign" | "download" | "delete";
export type StorageDecision = "allow" | "deny";

export type StorageAuditEntry = {
  userId: string | null;
  bucket: string;
  objectPath: string;
  operation: StorageOperation;
  decision: StorageDecision;
  reason?: string;
  /** Domain id (e.g. a wallet scan id). Combined with the per-request id. */
  correlationId?: string;
};

/** First path segment is the owner folder in all private buckets we use. */
export function pathOwner(objectPath: string): string | null {
  const seg = objectPath.split("/")[0]?.trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(seg ?? "")
    ? seg!
    : null;
}

/** True when the caller owns the folder the object lives in. */
export function ownsPath(userId: string | null, objectPath: string): boolean {
  const owner = pathOwner(objectPath);
  return !!userId && !!owner && owner === userId;
}

/** Throttle for on-write alert evaluation (at most once a minute per worker). */
let lastEvaluatedAt = 0;

/** Best-effort write; auditing must never break the user-facing operation. */
export async function logStorageAccess(entry: StorageAuditEntry): Promise<void> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { traceId } = await import("@/lib/request-context.server");
    await supabaseAdmin.from("storage_access_audit").insert({
      user_id: entry.userId,
      bucket: entry.bucket.slice(0, 64),
      object_path: entry.objectPath.slice(0, 512),
      operation: entry.operation,
      decision: entry.decision,
      reason: entry.reason?.slice(0, 200) ?? null,
      path_owner_id: pathOwner(entry.objectPath),
      correlation_id: traceId(entry.correlationId),
    });

    const mismatch =
      !!entry.userId && !!pathOwner(entry.objectPath) && !ownsPath(entry.userId, entry.objectPath);
    if (entry.decision === "deny" || mismatch) await maybeRaiseAlerts();
  } catch (e) {
    console.error("[storage-audit] log failed", e instanceof Error ? e.message : e);
  }
}

/**
 * Runs the deny-spike / owner-mismatch detectors over the recent audit trail.
 * Throttled and best-effort: alerting must never break a storage operation.
 */
async function maybeRaiseAlerts(): Promise<void> {
  const now = Date.now();
  if (now - lastEvaluatedAt < 60_000) return;
  lastEvaluatedAt = now;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.rpc("evaluate_storage_audit_alerts", {
      _window_minutes: 15,
      _deny_threshold: 10,
      _mismatch_threshold: 3,
    });
    if (error) console.error("[storage-audit] alert eval failed", error.message);
  } catch (e) {
    console.error("[storage-audit] alert eval failed", e instanceof Error ? e.message : e);
  }
}
