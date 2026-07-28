import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdmin } from "@/lib/admin-guard";

export type FunnelReportRow = {
  source: string;
  medium: string;
  campaign: string;
  variant: string;
  visitors: number;
  cta_clicks: number;
  signups: number;
  activations: number;
  avg_minutes_to_chart: number | null;
};

/**
 * Aggregated UTM funnel. Runs with elevated rights so raw visitor-level event
 * rows stay unreadable; only per-channel counts leave the server.
 */
export const getFunnelReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { days?: number }) => ({
    days: Math.min(Math.max(Number(input?.days ?? 30), 1), 365),
  }))
  .handler(async ({ data, context }): Promise<FunnelReportRow[]> => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin.rpc("ad_funnel_report", {
      _days: data.days,
    });
    if (error) throw new Error(error.message);
    return (rows ?? []) as FunnelReportRow[];
  });
