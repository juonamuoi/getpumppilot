import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { sendWalletPriceAlertEmail } from "@/lib/wallet-price-alert-email.server";

export type PriceAlertEmailInput = {
  test?: boolean;
  address?: string;
  correlationId?: string;
  alerts?: { symbol: string; message: string; ts: number }[];
};

/**
 * Emails the signed-in user about triggered wallet price alerts.
 * The recipient is always the authenticated account's own email address —
 * it is never accepted from the browser. Informational only: no trading.
 */
export const sendPriceAlertEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: PriceAlertEmailInput): PriceAlertEmailInput => {
    const alerts = Array.isArray(data.alerts) ? data.alerts.slice(0, 10) : [];
    return {
      test: !!data.test,
      address: typeof data.address === "string" ? data.address.slice(0, 80) : undefined,
      correlationId:
        typeof data.correlationId === "string" ? data.correlationId.slice(0, 64) : undefined,
      alerts: alerts.map((a) => ({
        symbol: String(a?.symbol ?? "").slice(0, 24),
        message: String(a?.message ?? "").slice(0, 300),
        ts: Number.isFinite(a?.ts) ? Number(a.ts) : Date.now(),
      })),
    };
  })
  .handler(async ({ data, context }): Promise<{ sent: boolean; reason?: string }> => {
    const email = (context.claims as { email?: string } | undefined)?.email;
    if (!email) return { sent: false, reason: "no_account_email" };
    return await sendWalletPriceAlertEmail(email, {
      test: data.test,
      address: data.address,
      correlationId: data.correlationId,
      alerts: data.alerts ?? [],
    });
  });
