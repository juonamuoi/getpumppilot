/**
 * Server-only sender for wallet threat alert emails.
 *
 * Emails go out through Lovable's managed email API. The send helper only
 * exists once the project's email templates are scaffolded (which requires a
 * verified sender domain), so this module degrades gracefully until then and
 * a scan never fails because email is not configured yet.
 */

import type { ThreatEmailInput } from "@/lib/threat-alerts.functions";

type Sender = (
  template: string,
  to: string,
  opts: { templateData?: Record<string, unknown>; idempotencyKey?: string },
) => Promise<{ sent: boolean; reason?: string }>;

const SEND_MODULE = "@/lib/email-templates/send-email";

async function getSender(): Promise<Sender | null> {
  try {
    const mod = (await import(/* @vite-ignore */ SEND_MODULE)) as unknown as {
      sendTemplateEmail: Sender;
    };
    return mod.sendTemplateEmail;
  } catch {
    return null;
  }
}

export async function sendThreatAlertEmail(
  to: string,
  data: ThreatEmailInput,
): Promise<{ sent: boolean; reason?: string }> {
  const findings = data.findings ?? [];
  const send = await getSender();
  if (!send) {
    console.warn("[threat-alerts] email skipped — sender domain not configured yet");
    return { sent: false, reason: "email_not_configured" };
  }

  const valueAtRisk = findings.reduce((s, f) => s + f.valueAtRiskUsd, 0);
  const key = data.test
    ? `wallet-threat-test-${to}-${new Date().toISOString().slice(0, 13)}`
    : `wallet-threat-${data.correlationId ?? findings[0]?.correlationId ?? Date.now()}`;

  try {
    const res = await send("wallet-threat-alert", to, {
      idempotencyKey: key,
      templateData: {
        test: !!data.test,
        address: data.address ?? "demo wallet",
        correlationId: data.correlationId ?? "",
        count: findings.length,
        valueAtRisk,
        findings,
      },
    });
    return res;
  } catch (e) {
    const err = e as { code?: string; message?: string; retryAfterSeconds?: number | null };
    console.error("[threat-alerts] email send failed", err.code ?? err.message);
    return { sent: false, reason: err.code ?? "send_failed" };
  }
}
