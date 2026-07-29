import { createFileRoute } from "@tanstack/react-router";

/**
 * Scheduled self-audit (pg_cron -> pg_net), runs daily.
 *
 * Re-fetches the published sitemap and re-runs the canonical / og:url /
 * redirect checks for every advertised URL, then records an alert for each new
 * failure. Public prefix so the scheduler can reach it; the caller must present
 * the project's publishable key.
 */
export const Route = createFileRoute("/api/public/hooks/seo-self-audit")({
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
          const { runSeoAudit } = await import("@/lib/seo-audit.server");
          const result = await runSeoAudit({
            origin: process.env.SEO_MONITOR_ORIGIN ?? "https://www.getpumppilot.app",
            source: "self-audit-scheduled",
            maxUrls: 40,
          });
          return new Response(
            JSON.stringify({
              success: true,
              ok: result.snapshot.ok,
              urlsChecked: result.snapshot.urls_checked,
              issues: result.snapshot.details.auditIssues.length,
              newFailures: result.alerts.filter((a) => a.severity !== "info").length,
              snapshotId: result.snapshotId,
            }),
            { headers: { "Content-Type": "application/json" } },
          );
        } catch (e) {
          console.error("[seo-self-audit]", e instanceof Error ? e.message : e);
          return new Response(
            JSON.stringify({ success: false, error: e instanceof Error ? e.message : "failed" }),
            { status: 500, headers: { "Content-Type": "application/json" } },
          );
        }
      },
    },
  },
});
