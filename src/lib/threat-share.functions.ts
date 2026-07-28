import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  MAX_PDF_BASE64_CHARS,
  ttlSeconds,
  uploadThreatReport,
} from "@/lib/threat-report.server";

export type ShareLinkInput = {
  /** Base64 PDF rendered in the browser. */
  pdfBase64: string;
  /** Scan correlation ID (used in the stored object name). */
  correlationId: string;
  /** Requested lifetime: "1h" | "24h" | "7d". */
  ttl?: string;
};

export type ShareLinkResult = {
  ok: boolean;
  url?: string;
  expiresAt?: number;
  correlationId?: string;
  reason?: string;
};

/**
 * Stores the wallet threat report PDF in the private bucket under the
 * authenticated user's own folder and returns a time-limited signed URL.
 * The link expires automatically; nothing is ever made public.
 */
export const createThreatReportShareLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: ShareLinkInput): ShareLinkInput => {
    const pdf = typeof data.pdfBase64 === "string" ? data.pdfBase64 : "";
    if (!pdf || pdf.length > MAX_PDF_BASE64_CHARS) {
      throw new Error("invalid_pdf");
    }
    return {
      pdfBase64: pdf,
      correlationId: String(data.correlationId ?? "").slice(0, 64),
      ttl: typeof data.ttl === "string" ? data.ttl.slice(0, 8) : undefined,
    };
  })
  .handler(async ({ data, context }): Promise<ShareLinkResult> => {
    const seconds = ttlSeconds(data.ttl);
    const up = await uploadThreatReport(
      context.userId,
      data.correlationId || `scan-${Date.now()}`,
      data.pdfBase64,
      seconds,
    );
    if (!up.url) return { ok: false, reason: up.reason ?? "share_failed" };
    return {
      ok: true,
      url: up.url,
      expiresAt: up.expiresAt,
      correlationId: data.correlationId,
    };
  });
