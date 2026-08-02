import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdmin } from "@/lib/admin-guard";

export type WalletFunnelStepRow = { step: string; events: number; visitors: number };
export type WalletFunnelSourceRow = {
  source: string;
  campaign: string;
  started: number;
  created: number;
  backed_up: number;
  active: number;
};
export type WalletFunnelDayRow = {
  day: string;
  started: number;
  created: number;
  active: number;
};

export type WalletFunnelReport = {
  ok: boolean;
  days: number;
  generated_at: string;
  total_events: number;
  steps: WalletFunnelStepRow[];
  active_wallets: number;
  churned: number;
  avg_minutes_to_active: number | null;
  sources: WalletFunnelSourceRow[];
  daily: WalletFunnelDayRow[];
};

/**
 * Aggregated `wallet_funnel` experiment report. Runs with elevated rights so
 * raw visitor-level rows never leave the server — only counts and averages.
 */
export const getWalletFunnelReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { days?: number }) => ({
    days: Math.min(Math.max(Number(input?.days ?? 30), 1), 365),
  }))
  .handler(async ({ data, context }): Promise<WalletFunnelReport> => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: report, error } = await supabaseAdmin.rpc("wallet_funnel_report", {
      _days: data.days,
    });
    if (error) throw new Error(error.message);
    return report as unknown as WalletFunnelReport;
  });
