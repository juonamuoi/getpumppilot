/**
 * Server-only sender for wallet price alert emails.
 *
 * Uses Lovable's managed email API. The send helper only exists once the
 * project's email templates are scaffolded (which requires a verified sender
 * domain), so this degrades gracefully until then — an alert never fails
 * because email is not configured yet.
 */

export type PriceAlertEmailData = {
  test?: boolean;
  address?: string;
  correlationId?: string;
  alerts: { symbol: string; message: string; ts: number }[];
};

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

export async function sendWalletPriceAlertEmail(
  to: string,
  data: PriceAlertEmailData,
): Promise<{ sent: boolean; reason?: string }> {
  const send = await getSender();
  if (!send) {
    console.warn("[wallet-price-alerts] email skipped — sender domain not configured yet");
    return { sent: false, reason: "email_not_configured" };
  }
  const key = data.test
    ? `wallet-price-test-${to}-${new Date().toISOString().slice(0, 13)}`
    : `wallet-price-${data.correlationId ?? Date.now()}`;
  try {
    return await send("wallet-price-alert", to, {
      idempotencyKey: key,
      templateData: {
        test: !!data.test,
        address: data.address ?? "",
        count: data.alerts.length,
        alerts: data.alerts,
      },
    });
  } catch (e) {
    const err = e as { code?: string; message?: string };
    console.error("[wallet-price-alerts] email send failed", err.code ?? err.message);
    return { sent: false, reason: err.code ?? "send_failed" };
  }
}
