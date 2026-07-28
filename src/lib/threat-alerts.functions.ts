import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sendThreatAlertEmail } from "@/lib/threat-alerts.server";
import { uploadThreatReport, MAX_PDF_BASE64_CHARS } from "@/lib/threat-report.server";

export type ThreatFinding = {
  token: string;
  spender: string;
  spenderLabel: string;
  risk: string;
  valueAtRiskUsd: number;
  reason: string;
  correlationId: string;
};

export type ThreatEmailInput = {
  address?: string;
  correlationId?: string;
  findings?: ThreatFinding[];
  test?: boolean;
  /** Base64 PDF threat report rendered in the browser, attached as a signed link. */
  pdfBase64?: string;
  /** Signed download link for the stored PDF report (filled server-side). */
  reportUrl?: string;
};

/**
 * Emails the signed-in user about newly detected risky wallet approvals.
 * The recipient is always the authenticated account's own email address —
 * it is never accepted from the browser.
 */
export const sendThreatEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: ThreatEmailInput): ThreatEmailInput => {
    const findings = Array.isArray(data.findings) ? data.findings.slice(0, 10) : [];
    const pdf =
      typeof data.pdfBase64 === "string" && data.pdfBase64.length <= MAX_PDF_BASE64_CHARS
        ? data.pdfBase64
        : undefined;
    return {
      test: !!data.test,
      pdfBase64: pdf,
      address: typeof data.address === "string" ? data.address.slice(0, 80) : undefined,
      correlationId:
        typeof data.correlationId === "string" ? data.correlationId.slice(0, 64) : undefined,
      findings: findings.map((f) => ({
        token: String(f.token ?? "").slice(0, 24),
        spender: String(f.spender ?? "").slice(0, 80),
        spenderLabel: String(f.spenderLabel ?? "").slice(0, 120),
        risk: String(f.risk ?? "").slice(0, 16),
        valueAtRiskUsd: Number.isFinite(f.valueAtRiskUsd) ? Math.round(f.valueAtRiskUsd) : 0,
        reason: String(f.reason ?? "").slice(0, 300),
        correlationId: String(f.correlationId ?? "").slice(0, 64),
      })),
    };
  })
  .handler(
    async ({
      data,
      context,
    }): Promise<{ sent: boolean; reason?: string; reportUrl?: string }> => {
      const email = (context.claims as { email?: string } | undefined)?.email;
      if (!email) return { sent: false, reason: "no_account_email" };

      let reportUrl: string | undefined;
      if (data.pdfBase64) {
        const up = await uploadThreatReport(
          context.userId,
          data.correlationId ?? `scan-${Date.now()}`,
          data.pdfBase64,
        );
        reportUrl = up.url ?? undefined;
      }

      const res = await sendThreatAlertEmail(email, {
        ...data,
        pdfBase64: undefined,
        reportUrl,
      });
      return { ...res, reportUrl };
    },
  );
