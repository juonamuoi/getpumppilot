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
): Promise<{ url: string | null; reason?: string; path?: string; expiresAt?: number }> {
  try {
    const bytes = base64ToBytes(pdfBase64);
    if (bytes.length === 0) return { url: null, reason: "empty_pdf" };

    const safeId = correlationId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64) || "report";
    const path = `${userId}/${new Date().toISOString().slice(0, 10)}/${safeId}.pdf`;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const up = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(path, bytes, { contentType: "application/pdf", upsert: true });
    if (up.error) {
      console.error("[threat-report] upload failed", up.error.message);
      return { url: null, reason: "upload_failed" };
    }

    const signed = await supabaseAdmin.storage
      .from(BUCKET)
      .createSignedUrl(path, expiresSeconds);
    if (signed.error || !signed.data?.signedUrl) {
      return { url: null, reason: "sign_failed" };
    }
    return {
      url: signed.data.signedUrl,
      path,
      expiresAt: Date.now() + expiresSeconds * 1000,
    };
  } catch (e) {
    console.error("[threat-report] unexpected failure", e instanceof Error ? e.message : e);
    return { url: null, reason: "report_failed" };
  }
}
