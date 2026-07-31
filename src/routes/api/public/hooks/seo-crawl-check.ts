import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "node:crypto";

/**
 * Scheduled crawl-health check (pg_cron -> pg_net, or an external scheduler).
 *
 * Public prefix so the scheduler can reach it, but the caller must present the
 * server-only `SEO_CRON_SECRET` in the `x-seo-cron-secret` header. The Supabase
 * publishable key is NOT accepted: it ships in the client bundle, so it proves
 * nothing about the caller.
 */
function authorized(request: Request) {
  const secret = process.env.SEO_CRON_SECRET;
  if (!secret) return false;
  const provided =
    request.headers.get("x-seo-cron-secret") ??
    request.headers.get("authorization")?.replace(/^Bearer /, "") ??
    "";
  const a = Buffer.from(provided);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

export const Route = createFileRoute("/api/public/hooks/seo-crawl-check")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!authorized(request)) {
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
