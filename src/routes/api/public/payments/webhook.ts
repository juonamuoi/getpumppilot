import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { type StripeEnv, verifyWebhook, createStripeClient } from "@/lib/stripe.server";
import { creditsForPrice } from "@/lib/credits";

let _supabase: ReturnType<typeof createClient> | null = null;
function getSupabase() {
  if (!_supabase) {
    _supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
  }
  return _supabase;
}

function resolvePriceId(item: any): string | undefined {
  return item?.price?.lookup_key || item?.price?.metadata?.lovable_external_id || item?.price?.id;
}

async function handleSubscriptionCreated(sub: any, env: StripeEnv) {
  const userId = sub.metadata?.userId;
  if (!userId) { console.error("No userId in subscription metadata"); return; }
  const item = sub.items?.data?.[0];
  const priceId = resolvePriceId(item);
  const productId = item?.price?.product;
  const periodStart = item?.current_period_start ?? sub.current_period_start;
  const periodEnd = item?.current_period_end ?? sub.current_period_end;

  await (getSupabase().from("subscriptions") as any).upsert({
    user_id: userId,
    stripe_subscription_id: sub.id,
    stripe_customer_id: sub.customer,
    product_id: productId,
    price_id: priceId,
    status: sub.status,
    current_period_start: periodStart ? new Date(periodStart * 1000).toISOString() : null,
    current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
    cancel_at_period_end: sub.cancel_at_period_end ?? false,
    environment: env,
    updated_at: new Date().toISOString(),
  }, { onConflict: "stripe_subscription_id" });
}

async function handleSubscriptionUpdated(sub: any, env: StripeEnv) {
  const item = sub.items?.data?.[0];
  const priceId = resolvePriceId(item);
  const productId = item?.price?.product;
  const periodStart = item?.current_period_start ?? sub.current_period_start;
  const periodEnd = item?.current_period_end ?? sub.current_period_end;
  await (getSupabase().from("subscriptions") as any).update({
    status: sub.status,
    product_id: productId,
    price_id: priceId,
    current_period_start: periodStart ? new Date(periodStart * 1000).toISOString() : null,
    current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
    cancel_at_period_end: sub.cancel_at_period_end || false,
    updated_at: new Date().toISOString(),
  }).eq("stripe_subscription_id", sub.id).eq("environment", env);
}

async function handleSubscriptionDeleted(sub: any, env: StripeEnv) {
  await (getSupabase().from("subscriptions") as any).update({
    status: "canceled",
    updated_at: new Date().toISOString(),
  }).eq("stripe_subscription_id", sub.id).eq("environment", env);
}

/** One-time credit pack purchase → grant credits (idempotent via the Stripe session id). */
async function handleCreditPurchase(session: any, env: StripeEnv) {
  if (session.mode !== "payment") return;
  if (session.payment_status !== "paid") return;
  const userId = session.metadata?.userId;
  if (!userId) { console.error("Credit purchase without userId metadata", session.id); return; }
  if (session.metadata?.purpose === "go_live_test") return;

  const stripe = createStripeClient(env);
  const items = await stripe.checkout.sessions.listLineItems(session.id, { limit: 20, expand: ["data.price"] });

  let total = 0;
  const detail: { priceId: string; quantity: number; credits: number }[] = [];
  for (const item of items.data) {
    const price: any = item.price;
    const lookup = price?.lookup_key || price?.metadata?.lovable_external_id;
    const per = creditsForPrice(lookup);
    if (!per) continue;
    const qty = item.quantity ?? 1;
    total += per * qty;
    detail.push({ priceId: lookup, quantity: qty, credits: per * qty });
  }
  if (total <= 0) { console.log("No credit packs in session", session.id); return; }

  const { error } = await (getSupabase() as any).rpc("grant_credits", {
    _user_id: userId,
    _amount: total,
    _kind: "purchase",
    _description: `Credit purchase — ${total.toLocaleString()} credits`,
    _external_ref: `stripe:${env}:${session.id}`,
    _metadata: { session_id: session.id, environment: env, items: detail },
  });
  if (error) console.error("grant_credits failed", error);
}

async function handleWebhook(req: Request, env: StripeEnv) {
  const event = await verifyWebhook(req, env);
  switch (event.type) {
    case "checkout.session.completed": await handleCreditPurchase(event.data.object, env); break;
    case "checkout.session.async_payment_succeeded": await handleCreditPurchase(event.data.object, env); break;
    case "customer.subscription.created": await handleSubscriptionCreated(event.data.object, env); break;
    case "customer.subscription.updated": await handleSubscriptionUpdated(event.data.object, env); break;
    case "customer.subscription.deleted": await handleSubscriptionDeleted(event.data.object, env); break;
    default: console.log("Unhandled event:", event.type);
  }
}

export const Route = createFileRoute("/api/public/payments/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const rawEnv = new URL(request.url).searchParams.get("env");
        if (rawEnv !== "sandbox" && rawEnv !== "live") {
          return Response.json({ received: true, ignored: "invalid env" });
        }
        try {
          await handleWebhook(request, rawEnv);
          return Response.json({ received: true });
        } catch (e) {
          console.error("Webhook error:", e);
          return new Response("Webhook error", { status: 400 });
        }
      },
    },
  },
});
