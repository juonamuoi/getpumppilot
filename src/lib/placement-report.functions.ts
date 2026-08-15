import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdmin } from "@/lib/admin-guard";

export type PlacementReportRow = {
  creative: string;
  placement: string;
  source: string;
  campaign: string;
  variant: string;
  clicks: number;
  click_visitors: number;
  signups: number;
  signup_rate: number | null;
};

/**
 * Creative x placement conversion report. Runs with elevated rights so raw
 * visitor-level rows stay unreadable — only aggregate counts leave the server.
 */
export const getPlacementReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { days?: number }) => ({
    days: Math.min(Math.max(Number(input?.days ?? 30), 1), 365),
  }))
  .handler(async ({ data, context }): Promise<PlacementReportRow[]> => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin.rpc("ad_placement_report", {
      _days: data.days,
    });
    if (error) throw new Error(error.message);
    return (rows ?? []) as PlacementReportRow[];
  });
