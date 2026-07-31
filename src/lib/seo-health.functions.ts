import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdmin } from "@/lib/admin-guard";
import type { SeoHealthReport } from "@/lib/seo-health.server";

export type {
  SeoHealthReport,
  SitemapFileStatus,
  RobotsStatus,
  SubmittedSitemap,
  IndexedUrlStatus,
} from "@/lib/seo-health.server";

/** Live sitemap + robots.txt + last-indexed status. Admin-only. */
export const getSeoHealth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { maxInspections?: number }) => ({
    maxInspections: Math.min(Math.max(Number(input?.maxInspections ?? 10), 0), 25),
  }))
  .handler(async ({ data, context }): Promise<SeoHealthReport> => {
    await assertAdmin(context.supabase, context.userId);
    const { buildSeoHealthReport } = await import("@/lib/seo-health.server");
    return buildSeoHealthReport({
      origin: process.env.SEO_MONITOR_ORIGIN ?? "https://www.getpumppilot.app",
      maxInspections: data.maxInspections,
    });
  });
