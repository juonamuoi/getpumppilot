import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-store";
import { getStripeEnvironment } from "@/lib/stripe";

export type SubscriptionRow = {
  id: string;
  user_id: string;
  stripe_subscription_id: string;
  stripe_customer_id: string;
  product_id: string;
  price_id: string;
  status: string;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  environment: string;
};

const PRO_PRICES = new Set(["pumppilot_pro_monthly", "pumppilot_pro_yearly"]);
const QUANT_PRICES = new Set(["pumppilot_quant_monthly", "pumppilot_quant_yearly"]);

export type Tier = "free" | "pro" | "quant";

function tierFromPrice(priceId: string | null | undefined): Tier {
  if (!priceId) return "free";
  if (QUANT_PRICES.has(priceId)) return "quant";
  if (PRO_PRICES.has(priceId)) return "pro";
  return "free";
}

export function useSubscription() {
  const { user } = useAuth();
  const [sub, setSub] = useState<SubscriptionRow | null>(null);
  const [loading, setLoading] = useState(true);
  const env = (() => { try { return getStripeEnvironment(); } catch { return "sandbox" as const; } })();

  const refetch = useCallback(async () => {
    if (!user) { setSub(null); setLoading(false); return; }
    const { data } = await supabase
      .from("subscriptions")
      .select("*")
      .eq("user_id", user.id)
      .eq("environment", env)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    setSub((data as SubscriptionRow | null) ?? null);
    setLoading(false);
  }, [user, env]);

  useEffect(() => { refetch(); }, [refetch]);

  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel(`sub:${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "subscriptions", filter: `user_id=eq.${user.id}` }, () => refetch())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, refetch]);

  const now = Date.now();
  const periodEnd = sub?.current_period_end ? new Date(sub.current_period_end).getTime() : null;
  const withinPeriod = periodEnd === null || periodEnd > now;
  const isActive = !!sub && withinPeriod && (
    ["active", "trialing", "past_due"].includes(sub.status) ||
    (sub.status === "canceled" && !!periodEnd && periodEnd > now)
  );
  const tier: Tier = isActive ? tierFromPrice(sub?.price_id) : "free";

  return { subscription: sub, tier, isActive, loading, refetch, environment: env };
}
