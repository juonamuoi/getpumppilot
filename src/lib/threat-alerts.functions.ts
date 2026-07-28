import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sendThreatAlertEmail } from "@/lib/threat-alerts.server";

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
    return {
      test: !!data.test,
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
  .handler(async ({ data, context }): Promise<{ sent: boolean; reason?: string }> => {
    const email = (context.claims as { email?: string } | undefined)?.email;
    if (!email) return { sent: false, reason: "no_account_email" };
    return sendThreatAlertEmail(email, data);
  });
