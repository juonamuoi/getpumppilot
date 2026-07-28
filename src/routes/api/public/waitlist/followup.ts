import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "crypto";

/**
 * Follow-up dispatcher for waitlist signups.
 *
 * Called on a schedule (or manually) with the shared secret header. It sends a
 * single follow-up email to everyone who joined more than 3 days ago and has
 * not been followed up yet.
 */
const FOLLOWUP_AFTER_DAYS = 3;
const BATCH_SIZE = 50;

function authorized(request: Request) {
  const secret = process.env.WAITLIST_FOLLOWUP_SECRET;
  if (!secret) return false;
  const provided = request.headers.get("x-waitlist-secret") ?? "";
  const a = Buffer.from(provided);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

export const Route = createFileRoute("/api/public/waitlist/followup")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!authorized(request)) {
          return new Response("Unauthorized", { status: 401 });
        }

        const { supabaseAdmin } = await import(
          "@/integrations/supabase/client.server"
        );
        const cutoff = new Date(
          Date.now() - FOLLOWUP_AFTER_DAYS * 24 * 60 * 60 * 1000,
        ).toISOString();

        const { data, error } = await supabaseAdmin
          .from("waitlist_signups")
          .select("id, email")
          .is("followup_sent_at", null)
          .lt("created_at", cutoff)
          .limit(BATCH_SIZE);

        if (error) return new Response("Query failed", { status: 500 });

        const { sendWaitlistFollowUp } = await import(
          "@/lib/waitlist-email.server"
        );

        let sent = 0;
        for (const row of data ?? []) {
          try {
            const ok = await sendWaitlistFollowUp(row.email, row.id);
            if (!ok) continue;
            await supabaseAdmin
              .from("waitlist_signups")
              .update({
                status: "followed_up",
                followup_sent_at: new Date().toISOString(),
              })
              .eq("id", row.id);
            sent += 1;
          } catch (err) {
            console.error("waitlist follow-up failed", row.id, err);
          }
        }

        return Response.json({ ok: true, candidates: data?.length ?? 0, sent });
      },
    },
  },
});
