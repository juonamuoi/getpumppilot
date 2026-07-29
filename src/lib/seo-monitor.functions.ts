import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdmin } from "@/lib/admin-guard";

export type SeoSnapshotRow = {
  id: string;
  created_at: string;
  source: string;
  site_url: string;
  sitemap_errors: number;
  sitemap_warnings: number;
  submitted_urls: number;
  indexed_urls: number;
  canonical_mismatches: number;
  urls_checked: number;
  crawl_errors: number;
  ok: boolean;
  error: string | null;
  details: {
    sitemaps?: Array<{
      path: string;
      errors: number;
      warnings: number;
      submitted: number;
      indexed: number;
      lastDownloaded: string | null;
      isPending: boolean;
    }>;
    canonicalIssues?: Array<{
      url: string;
      declaredCanonical: string | null;
      googleCanonical: string | null;
      coverageState: string | null;
      verdict: string | null;
      issue: string;
    }>;
    sampledUrls?: string[];
  };
};

export type SeoAlertRow = {
  id: string;
  created_at: string;
  snapshot_id: string | null;
  site_url: string;
  metric: string;
  previous_value: number | null;
  current_value: number | null;
  delta: number | null;
  severity: "info" | "warning" | "critical";
  message: string;
  acknowledged_at: string | null;
  acknowledged_by: string | null;
};

/** Snapshot history for the trend charts. Admin-only. */
export const getSeoCrawlHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { days?: number }) => ({
    days: Math.min(Math.max(Number(input?.days ?? 30), 1), 365),
  }))
  .handler(async ({ data, context }): Promise<SeoSnapshotRow[]> => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const since = new Date(Date.now() - data.days * 86_400_000).toISOString();
    const { data: rows, error } = await supabaseAdmin
      .from("seo_crawl_snapshots")
      .select("*")
      .gte("created_at", since)
      .order("created_at", { ascending: true })
      .limit(500);
    if (error) throw new Error(error.message);
    return (rows ?? []) as unknown as SeoSnapshotRow[];
  });

/** Change feed. Admin-only. */
export const getSeoCrawlAlerts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { days?: number; onlyOpen?: boolean; severity?: string }) => ({
    days: Math.min(Math.max(Number(input?.days ?? 30), 1), 365),
    onlyOpen: !!input?.onlyOpen,
    severity: ["info", "warning", "critical"].includes(String(input?.severity))
      ? String(input?.severity)
      : "all",
  }))
  .handler(async ({ data, context }): Promise<SeoAlertRow[]> => {
    await assertAdmin(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const since = new Date(Date.now() - data.days * 86_400_000).toISOString();
    let q = supabaseAdmin
      .from("seo_crawl_alerts")
      .select("*")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(300);
    if (data.onlyOpen) q = q.is("acknowledged_at", null);
    if (data.severity !== "all") q = q.eq("severity", data.severity);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return (rows ?? []) as unknown as SeoAlertRow[];
  });

/** Mark alerts as reviewed so the feed only shows new changes. */
export const acknowledgeSeoAlerts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { ids: string[] }) => ({
    ids: (Array.isArray(input?.ids) ? input.ids : []).slice(0, 200).map(String),
  }))
  .handler(async ({ data, context }): Promise<{ updated: number }> => {
    await assertAdmin(context.supabase, context.userId);
    if (!data.ids.length) return { updated: 0 };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("seo_crawl_alerts")
      .update({ acknowledged_at: new Date().toISOString(), acknowledged_by: context.userId } as never)
      .in("id", data.ids);
    if (error) throw new Error(error.message);
    return { updated: data.ids.length };
  });

/** Run a crawl-health check now. Admin-only; the cron route runs the same code. */
export const runSeoCrawlCheck = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { sampleSize?: number }) => ({
    sampleSize: Math.min(Math.max(Number(input?.sampleSize ?? 8), 1), 25),
  }))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { runCrawlCheck } = await import("@/lib/seo-monitor.server");
    const origin = process.env.SEO_MONITOR_ORIGIN ?? "https://www.getpumppilot.app";
    const result = await runCrawlCheck({
      origin,
      source: "manual",
      sampleSize: data.sampleSize,
      notifyEmail: process.env.SEO_ALERT_EMAIL,
    });
    return {
      ok: result.snapshot.ok,
      error: result.snapshot.error,
      alerts: result.alerts.length,
      snapshotId: result.snapshotId,
    };
  });
