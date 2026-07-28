import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-store";
import { CREDIT_COSTS, CREDIT_LABELS, LOW_BALANCE_THRESHOLD, type CreditFeature } from "@/lib/credits";

export type CreditBalanceRow = {
  user_id: string;
  balance: number;
  lifetime_purchased: number;
  lifetime_spent: number;
  updated_at: string;
};

export type CreditLedgerRow = {
  id: string;
  delta: number;
  balance_after: number;
  kind: string;
  feature: string | null;
  description: string | null;
  created_at: string;
};

export type SpendResult =
  | { ok: true; charged: number; balance: number }
  | { ok: false; reason: "insufficient_credits" | "unauthenticated" | "error"; balance: number; required: number };

export function useCredits() {
  const { user } = useAuth();
  const [balance, setBalance] = useState<number | null>(null);
  const [row, setRow] = useState<CreditBalanceRow | null>(null);
  const [ledger, setLedger] = useState<CreditLedgerRow[]>([]);
  const [loading, setLoading] = useState(true);

  const refetch = useCallback(async () => {
    if (!user) {
      setRow(null);
      setBalance(null);
      setLedger([]);
      setLoading(false);
      return;
    }
    const [{ data: bal }, { data: log }] = await Promise.all([
      supabase.from("credit_balances").select("*").eq("user_id", user.id).maybeSingle(),
      supabase
        .from("credit_ledger")
        .select("id, delta, balance_after, kind, feature, description, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50),
    ]);
    setRow((bal as CreditBalanceRow | null) ?? null);
    setBalance(((bal as CreditBalanceRow | null)?.balance) ?? 0);
    setLedger((log as CreditLedgerRow[] | null) ?? []);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel(`credits:${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "credit_balances", filter: `user_id=eq.${user.id}` },
        () => refetch(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [user, refetch]);

  /** Charge credits for a feature. Returns ok:false when the account is out of credits. */
  const spend = useCallback(
    async (feature: CreditFeature, opts?: { amount?: number; description?: string; metadata?: Record<string, unknown> }): Promise<SpendResult> => {
      const amount = opts?.amount ?? CREDIT_COSTS[feature];
      if (!user) return { ok: false, reason: "unauthenticated", balance: 0, required: amount };
      const { data, error } = await supabase.rpc("consume_credits", {
        _amount: amount,
        _feature: feature,
        _description: opts?.description ?? CREDIT_LABELS[feature],
        _metadata: (opts?.metadata ?? {}) as never,
      });
      if (error) {
        return { ok: false, reason: "error", balance: balance ?? 0, required: amount };
      }
      const res = data as unknown as { ok: boolean; reason?: string; balance?: number; charged?: number; required?: number };
      if (res?.ok) {
        setBalance(res.balance ?? 0);
        refetch();
        return { ok: true, charged: res.charged ?? amount, balance: res.balance ?? 0 };
      }
      setBalance(res?.balance ?? 0);
      return {
        ok: false,
        reason: (res?.reason as SpendResult extends { ok: false } ? never : never) ?? "insufficient_credits",
        balance: res?.balance ?? 0,
        required: res?.required ?? amount,
      } as SpendResult;
    },
    [user, balance, refetch],
  );

  const empty = (balance ?? 0) <= 0;
  const low = !empty && (balance ?? 0) <= LOW_BALANCE_THRESHOLD;

  return { balance: balance ?? 0, row, ledger, loading, refetch, spend, empty, low };
}
