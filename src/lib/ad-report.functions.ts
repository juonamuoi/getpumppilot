import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdmin } from "@/lib/admin-guard";

export type CreativeReportRow = {
  variant: string;
  creative_id: string;
  impressions: number;
  clicks: number;
  signups: number;
  visitors: number;
};

/**
 * Aggregated A/B results. Runs with elevated rights so raw event rows stay
 * unreadable; only counts leave the server.
 */
export const getCreativeReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { days?: number }) => ({
    days: Math.min(Math.max(Number(input?.days ?? 30), 1), 365),
  }))
  .handler(async ({ data, context }): Promise<CreativeReportRow[]> => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin.rpc("ad_creative_report", {
      _experiment: "landing_hero",
      _days: data.days,
    });
    if (error) throw new Error(error.message);
    return (rows ?? []) as CreativeReportRow[];
  });
