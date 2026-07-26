import { defineAuditedTool } from "../audit";
import { NOT_AUTHENTICATED, supabaseForUser } from "../supabase";

export default defineAuditedTool({
  name: "subscription_status",
  title: "Subscription status",
  description: "Report the signed-in user's current PumpPilot AI plan and billing period.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_input, ctx) => {
    if (!ctx.isAuthenticated()) return NOT_AUTHENTICATED;

    const { data, error } = await supabaseForUser(ctx)
      .from("subscriptions")
      .select("status,product_id,price_id,current_period_end,cancel_at_period_end,environment")
      .eq("user_id", ctx.getUserId()!)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) return { content: [{ type: "text", text: error.message }], isError: true };

    const payload = data ?? { status: "free", product_id: null };
    return {
      content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
      structuredContent: { subscription: payload },
    };
  },
});
