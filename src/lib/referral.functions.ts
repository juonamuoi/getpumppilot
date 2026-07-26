import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Records a referral for the authenticated caller.
 *
 * The referral-code lookup routine is server-only (no client or agent can
 * call it directly), so resolution happens here with the verified user id
 * from the bearer token — the caller can never attribute a referral to
 * someone else.
 */
export const recordReferral = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z.object({ code: z.string().regex(/^[a-f0-9]{4,16}$/i) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: referrerId } = await supabaseAdmin.rpc("resolve_referral_code", {
      _code: data.code.toLowerCase(),
    });

    if (!referrerId || referrerId === context.userId) {
      return { recorded: false as const };
    }

    const { error } = await supabaseAdmin.from("referrals").insert({
      referrer_id: referrerId,
      referred_user_id: context.userId,
      referrer_code: data.code.toLowerCase(),
      status: "signed_up",
    });

    // 23505 = duplicate; the referral already exists, which is fine.
    if (error && error.code !== "23505") {
      return { recorded: false as const };
    }

    return { recorded: true as const };
  });
