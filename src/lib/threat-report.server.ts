/**
 * Server-only upload of a wallet threat report PDF.
 *
 * The PDF is rendered in the browser (jsPDF) and posted here as base64. We
 * store it in the private "threat-reports" bucket under the authenticated
 * user's own folder and return a time-limited signed download link that is
 * embedded in the alert email. Nothing is ever public.
 */

const BUCKET = "threat-reports";
/** Signed link lifetime: 7 days. */
const EXPIRES_SECONDS = 60 * 60 * 24 * 7;
/** Hard cap on accepted payload size (~3 MB of base64). */
export const MAX_PDF_BASE64_CHARS = 3_000_000;

function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.includes(",") ? b64.slice(b64.indexOf(",") + 1) : b64;
  const bin = atob(clean);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Allowed signed-link lifetimes for user-created share links (seconds). */
export const SHARE_TTL_OPTIONS = [
  { id: "1h", label: "1 hour", seconds: 60 * 60 },
  { id: "24h", label: "24 hours", seconds: 60 * 60 * 24 },
  { id: "7d", label: "7 days", seconds: 60 * 60 * 24 * 7 },
] as const;

export type ShareTtlId = (typeof SHARE_TTL_OPTIONS)[number]["id"];

export function ttlSeconds(id: string | undefined): number {
  return SHARE_TTL_OPTIONS.find((o) => o.id === id)?.seconds ?? EXPIRES_SECONDS;
}

export async function uploadThreatReport(
  userId: string,
  correlationId: string,
  pdfBase64: string,
  expiresSeconds: number = EXPIRES_SECONDS,
): Promise<{
  url: string | null;
  reason?: string;
  path?: string;
  expiresAt?: number;
  /** Per-request trace id, also stamped on every storage-audit row below. */
  requestId?: string;
  /** Correlation id as stored in the audit trail (`scanId#requestId`). */
  traceId?: string;
}> {
  const { logStorageAccess, ownsPath } = await import("@/lib/storage-audit.server");
  const { getRequestId, traceId } = await import("@/lib/request-context.server");
  const requestId = getRequestId() ?? undefined;
  const trace = traceId(correlationId) ?? undefined;
  const safeId = correlationId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64) || "report";
  const path = `${userId}/${new Date().toISOString().slice(0, 10)}/${safeId}.pdf`;

  // Objects are always written under the caller's own folder. A mismatch means
  // the path was tampered with upstream — record the denial and stop.
  if (!ownsPath(userId, path)) {
    await logStorageAccess({
      userId,
      bucket: BUCKET,
      objectPath: path,
      operation: "upload",
      decision: "deny",
      reason: "path_owner_mismatch",
      correlationId,
    });
    return { url: null, reason: "forbidden_path", requestId, traceId: trace };
  }

  try {
    const bytes = base64ToBytes(pdfBase64);
    if (bytes.length === 0) {
      await logStorageAccess({
        userId,
        bucket: BUCKET,
        objectPath: path,
        operation: "upload",
        decision: "deny",
        reason: "empty_pdf",
        correlationId,
      });
      return { url: null, reason: "empty_pdf", requestId, traceId: trace };
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const up = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(path, bytes, { contentType: "application/pdf", upsert: true });
    await logStorageAccess({
      userId,
      bucket: BUCKET,
      objectPath: path,
      operation: "upload",
      decision: up.error ? "deny" : "allow",
      reason: up.error ? `upload_failed: ${up.error.message}` : undefined,
      correlationId,
    });
    if (up.error) {
      console.error("[threat-report] upload failed", requestId, up.error.message);
      return { url: null, reason: "upload_failed", requestId, traceId: trace };
    }

    const signed = await supabaseAdmin.storage
      .from(BUCKET)
      .createSignedUrl(path, expiresSeconds);
    const signFailed = !!signed.error || !signed.data?.signedUrl;
    await logStorageAccess({
      userId,
      bucket: BUCKET,
      objectPath: path,
      operation: "sign",
      decision: signFailed ? "deny" : "allow",
      reason: signFailed
        ? `sign_failed: ${signed.error?.message ?? "no_url"}`
        : `signed_ttl_${expiresSeconds}s`,
      correlationId,
    });
    if (signFailed) return { url: null, reason: "sign_failed", requestId, traceId: trace };

    return {
      url: signed.data!.signedUrl,
      path,
      expiresAt: Date.now() + expiresSeconds * 1000,
      requestId,
      traceId: trace,
    };
  } catch (e) {
    await logStorageAccess({
      userId,
      bucket: BUCKET,
      objectPath: path,
      operation: "upload",
      decision: "deny",
      reason: `unexpected: ${e instanceof Error ? e.message : "error"}`,
      correlationId,
    });
    console.error(
      "[threat-report] unexpected failure",
      requestId,
      e instanceof Error ? e.message : e,
    );
    return { url: null, reason: "report_failed", requestId, traceId: trace };
  }
}

