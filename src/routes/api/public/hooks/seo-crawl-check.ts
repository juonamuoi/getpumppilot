import { createFileRoute } from "@tanstack/react-router";

/**
 * Scheduled crawl-health check (pg_cron -> pg_net).
 *
 * Public prefix so the scheduler can reach it, but the caller must present the
 * project's publishable key in the apikey header before any work is done.
 */
export const Route = createFileRoute("/api/public/hooks/seo-crawl-check")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const key =
          request.headers.get("apikey") ??
          request.headers.get("authorization")?.replace(/^Bearer /, "");
        const expected =
          process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
        if (!expected || key !== expected) {
          return new Response(JSON.stringify({ error: "unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }

        try {
          const { runCrawlCheck } = await import("@/lib/seo-monitor.server");
          const result = await runCrawlCheck({
            origin: process.env.SEO_MONITOR_ORIGIN ?? "https://www.getpumppilot.app",
            source: "scheduled",
            sampleSize: 8,
            notifyEmail: process.env.SEO_ALERT_EMAIL,
          });
          return new Response(
            JSON.stringify({
              success: true,
              ok: result.snapshot.ok,
              alerts: result.alerts.length,
              snapshotId: result.snapshotId,
            }),
            { headers: { "Content-Type": "application/json" } },
          );
        } catch (e) {
          console.error("[seo-crawl-check]", e instanceof Error ? e.message : e);
          return new Response(
            JSON.stringify({ success: false, error: e instanceof Error ? e.message : "failed" }),
            { status: 500, headers: { "Content-Type": "application/json" } },
          );
        }
      },
    },
  },
});
