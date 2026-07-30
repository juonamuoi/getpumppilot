import { createFileRoute } from "@tanstack/react-router";

/**
 * GET /api/storage-audit/export
 *
 * Admin-only streamed export of the append-only storage access audit trail.
 * Rows are paged out of the database (`pageSize` at a time, up to `limit`) and
 * written straight to the response, so large exports never buffer in memory.
 *
 * Auth: `Authorization: Bearer <supabase access token>` — the caller's own
 * client is used to verify the `admin` role before any service-role read.
 *
 * Query: format=csv|json, hours, bucket, decision, operation, q, limit,
 * pageSize, offset. Every value is bounded server-side.
 */
export const Route = createFileRoute("/api/storage-audit/export")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const {
          authorizeAdmin,
          parseExportQuery,
          fetchAuditPage,
          csvHeader,
          csvRow,
          exportFilename,
        } = await import("@/lib/storage-audit-export.server");
        const { getRequestId } = await import("@/lib/request-context.server");

        const requestId = getRequestId() ?? "";
        const auth = await authorizeAdmin(request);
        if (!auth.ok) {
          return Response.json(
            { error: auth.error, requestId },
            { status: auth.status, headers: { "x-request-id": requestId } },
          );
        }

        const query = parseExportQuery(new URL(request.url));
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const encoder = new TextEncoder();

        const stream = new ReadableStream<Uint8Array>({
          async start(controller) {
            const push = (s: string) => controller.enqueue(encoder.encode(s));
            let sent = 0;
            try {
              if (query.format === "csv") push(csvHeader());
              else push(`{"requestId":${JSON.stringify(requestId)},"rows":[`);

              while (sent < query.limit) {
                const from = query.offset + sent;
                const to = from + Math.min(query.pageSize, query.limit - sent) - 1;
                const page = await fetchAuditPage(supabaseAdmin as never, query, from, to);
                if (page.length === 0) break;

                for (const row of page) {
                  if (query.format === "csv") push(csvRow(row));
                  else push(`${sent === 0 ? "" : ","}${JSON.stringify(row)}`);
                  sent++;
                }
                if (page.length < to - from + 1) break;
              }

              if (query.format === "json") push(`],"count":${sent}}`);
            } catch (e) {
              const message = e instanceof Error ? e.message : "export_failed";
              console.error("[storage-audit-export] failed", requestId, message);
              if (query.format === "json") push(`],"count":${sent},"error":"export_failed"}`);
              else push(`# export_failed: ${message.replace(/[\r\n]/g, " ")}\n`);
            } finally {
              controller.close();
            }
          },
        });

        return new Response(stream, {
          headers: {
            "content-type":
              query.format === "csv"
                ? "text/csv; charset=utf-8"
                : "application/json; charset=utf-8",
            "content-disposition": `attachment; filename="${exportFilename(query)}"`,
            "cache-control": "no-store",
            "x-request-id": requestId,
          },
        });
      },
    },
  },
});
