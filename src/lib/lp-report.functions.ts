import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type LpVariantReportRow = {
  variant: string;
  impressions: number;
  visitors: number;
  cta_clicks: number;
  cta_clickers: number;
  signups: number;
};

/**
 * Per-landing-variant performance. Runs with elevated rights so raw
 * visitor-level rows stay unreadable — only aggregate counts leave the server.
 */
export const getLpVariantReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { days?: number }) => ({
    days: Math.min(Math.max(Number(input?.days ?? 30), 1), 365),
  }))
  .handler(async ({ data }): Promise<LpVariantReportRow[]> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin.rpc("lp_variant_report", {
      _days: data.days,
    });
    if (error) throw new Error(error.message);
    return (rows ?? []) as LpVariantReportRow[];
  });
