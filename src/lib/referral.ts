import { supabase } from "@/integrations/supabase/client";

const REF_KEY = "pumppilot_ref_code";

/** Capture ?ref= from the current URL into localStorage. Call on app boot. */
export function captureReferralFromUrl(): void {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams(window.location.search);
  const code = params.get("ref");
  if (code && /^[a-f0-9]{4,16}$/i.test(code)) {
    try {
      // Don't overwrite if already stored — first referrer wins.
      if (!localStorage.getItem(REF_KEY)) {
        localStorage.setItem(REF_KEY, code.toLowerCase());
      }
    } catch {}
  }
}

export function getStoredReferralCode(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(REF_KEY);
  } catch {
    return null;
  }
}

export function clearStoredReferralCode(): void {
  try { localStorage.removeItem(REF_KEY); } catch {}
}

/**
 * Called after a user signs in for the first time. Looks up the stored
 * referral code, resolves it to a referrer, and records the referral.
 * Safe to call repeatedly — the unique constraint on referred_user_id
 * prevents duplicates, and existing users are skipped.
 */
export async function recordReferralIfPresent(userId: string): Promise<void> {
  const code = getStoredReferralCode();
  if (!code) return;

  // Look up the referrer via the public code table.
  const { data: codeRow } = await supabase
    .from("referral_codes")
    .select("user_id")
    .eq("code", code)
    .maybeSingle();

  if (!codeRow || codeRow.user_id === userId) {
    clearStoredReferralCode();
    return;
  }

  const { error } = await supabase.from("referrals").insert({
    referrer_id: codeRow.user_id,
    referred_user_id: userId,
    referrer_code: code,
    status: "signed_up",
  });

  // If it was a duplicate, silently ignore. Either way clear the code.
  if (!error || error.code === "23505") {
    clearStoredReferralCode();
  }
}

/** Get the current user's own referral code. */
export async function getMyReferralCode(userId: string): Promise<string | null> {
  const { data } = await supabase
    .from("referral_codes")
    .select("code")
    .eq("user_id", userId)
    .maybeSingle();
  return data?.code ?? null;
}

/** Count how many people the current user has referred. */
export async function getMyReferralCount(userId: string): Promise<number> {
  const { count } = await supabase
    .from("referrals")
    .select("id", { count: "exact", head: true })
    .eq("referrer_id", userId);
  return count ?? 0;
}

/** Sum of free Pro months credited to the current user (referrer + referred). */
export async function getMyRewardMonths(): Promise<number> {
  const { data, error } = await supabase.rpc("my_referral_reward_months");
  if (error || typeof data !== "number") return 0;
  return data;
}

/** Number of referrals that have qualified (7-day active) so far. */
export async function getMyQualifiedReferralCount(userId: string): Promise<number> {
  const { count } = await supabase
    .from("referrals")
    .select("id", { count: "exact", head: true })
    .eq("referrer_id", userId)
    .not("reward_granted_at", "is", null);
  return count ?? 0;
}
