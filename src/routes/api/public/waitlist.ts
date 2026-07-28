import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const bodySchema = z.object({
  email: z.string().trim().email().max(255),
  source: z.string().trim().max(64).optional(),
  utm_source: z.string().trim().max(120).optional(),
  utm_medium: z.string().trim().max(120).optional(),
  utm_campaign: z.string().trim().max(120).optional(),
});

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });

export const Route = createFileRoute("/api/public/waitlist")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let parsed;
        try {
          parsed = bodySchema.parse(await request.json());
        } catch {
          return json({ ok: false, error: "invalid_input" }, 400);
        }

        const email = parsed.email.toLowerCase();
        const { supabaseAdmin } = await import(
          "@/integrations/supabase/client.server"
        );

        const { data: existing } = await supabaseAdmin
          .from("waitlist_signups")
          .select("id, confirmation_sent_at")
          .eq("email", email)
          .maybeSingle();

        let id = existing?.id ?? null;
        if (!id) {
          const { data, error } = await supabaseAdmin
            .from("waitlist_signups")
            .insert({
              email,
              source: parsed.source ?? "landing",
              utm_source: parsed.utm_source ?? null,
              utm_medium: parsed.utm_medium ?? null,
              utm_campaign: parsed.utm_campaign ?? null,
            })
            .select("id")
            .single();
          if (error) return json({ ok: false, error: "signup_failed" }, 500);
          id = data.id;
        }

        // Automatic confirmation email. Skipped silently until the sender
        // domain is verified — the signup itself is already saved.
        if (!existing?.confirmation_sent_at) {
          try {
            const { sendWaitlistConfirmation } = await import(
              "@/lib/waitlist-email.server"
            );
            const sent = await sendWaitlistConfirmation(email, id!);
            if (sent) {
              await supabaseAdmin
                .from("waitlist_signups")
                .update({
                  status: "confirmed",
                  confirmation_sent_at: new Date().toISOString(),
                })
                .eq("id", id!);
            }
          } catch (err) {
            console.error("waitlist confirmation email failed", err);
          }
        }

        return json({ ok: true, alreadyJoined: Boolean(existing) });
      },
    },
  },
});
