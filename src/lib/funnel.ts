import { supabase } from "@/integrations/supabase/client";
import { getVisitorId } from "@/lib/ad-creatives";

/**
 * UTM-based conversion funnel.
 *
 * Steps are stored in `ad_creative_events` under a dedicated experiment so the
 * creative A/B report stays untouched. Attribution is first-touch: the UTM tags
 * captured on the visitor's first landing are reused for every later step.
 */
export const FUNNEL_EXPERIMENT = "signup_funnel";

export type FunnelStep = "visit" | "cta_click" | "signup" | "first_chart";

export const FUNNEL_STEPS: { step: FunnelStep; label: string; help: string }[] = [
  { step: "visit", label: "Landed", help: "Visitor arrived from the ad" },
  { step: "cta_click", label: "Clicked CTA", help: "Tapped a Start free button" },
  { step: "signup", label: "Signed up", help: "Created an account" },
  { step: "first_chart", label: "First chart", help: "Opened their first asset chart" },
];

const UTM_KEY = "pp_utm_first_touch";
const STEP_KEY = "pp_funnel_step";

export type UtmContext = {
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  variant: string;
  landing_path: string;
  captured_at: string;
};

function safeGet(key: string) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function safeSet(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage unavailable */
  }
}

function clamp(value: string | null, fallback: string | null = null) {
  if (!value) return fallback;
  return value.slice(0, 64);
}

/** Returns the stored first-touch UTM context, if any. */
export function getUtmContext(): UtmContext | null {
  const raw = safeGet(UTM_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as UtmContext;
  } catch {
    return null;
  }
}

/**
 * Capture UTM tags from the current URL. First touch wins — a later organic
 * visit never overwrites the campaign that originally acquired the visitor.
 */
export function captureUtmFromUrl(): UtmContext | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  const existing = getUtmContext();

  const hasUtm =
    params.get("utm_source") || params.get("utm_medium") || params.get("utm_campaign");
  if (existing && !hasUtm) return existing;
  if (existing && hasUtm && existing.utm_source === clamp(params.get("utm_source"))) {
    return existing;
  }
  if (existing) return existing;

  const path = window.location.pathname;
  const ctx: UtmContext = {
    utm_source: clamp(params.get("utm_source")),
    utm_medium: clamp(params.get("utm_medium")),
    utm_campaign: clamp(params.get("utm_campaign")),
    utm_content: clamp(params.get("utm_content")),
    variant: clamp(path.startsWith("/lp/") ? path.slice(4) : "site", "site") as string,
    landing_path: path.slice(0, 200),
    captured_at: new Date().toISOString(),
  };
  safeSet(UTM_KEY, JSON.stringify(ctx));
  return ctx;
}

function stepKey(step: FunnelStep) {
  return `${STEP_KEY}:${step}`;
}

/** True when this browser already recorded the step. */
export function hasTrackedStep(step: FunnelStep) {
  return safeGet(stepKey(step)) !== null;
}

/**
 * Record a funnel step once per browser. Best-effort: analytics must never
 * break a page or block the UI.
 */
export async function trackFunnelStep(step: FunnelStep, userId?: string | null) {
  if (typeof window === "undefined") return;
  if (hasTrackedStep(step)) return;
  safeSet(stepKey(step), new Date().toISOString());

  const ctx = captureUtmFromUrl() ?? getUtmContext();
  try {
    await supabase.from("ad_creative_events").insert({
      experiment: FUNNEL_EXPERIMENT,
      variant: ctx?.variant ?? "site",
      creative_id: ctx?.utm_content ?? "none",
      event: step,
      visitor_id: getVisitorId(),
      user_id: userId ?? null,
      utm_source: ctx?.utm_source ?? null,
      utm_medium: ctx?.utm_medium ?? null,
      utm_campaign: ctx?.utm_campaign ?? null,
    });
  } catch {
    /* ignore */
  }
}

/* ------------------------------------------------------------------ *
 * CTA click attribution
 *
 * `trackFunnelStep` is deduped once per browser so the funnel report stays
 * a clean per-visitor funnel. For CTA volume we also record EVERY click,
 * tagged with the placement (hero, nav, footer, pricing card …), the landing
 * variant and the first-touch UTM tags. The signup that follows is then
 * attributed back to the last CTA the visitor tapped.
 * ------------------------------------------------------------------ */

const CTA_KEY = "pp_last_cta";

export type CtaAttribution = {
  placement: string;
  variant: string;
  landing_path: string;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  clicked_at: string;
};

/** The last "Start free" CTA this visitor clicked, if any. */
export function getCtaAttribution(): CtaAttribution | null {
  const raw = safeGet(CTA_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as CtaAttribution;
  } catch {
    return null;
  }
}

/**
 * Record a "Start free" CTA click. Fires on every click (not deduped) and
 * stores the attribution so the resulting signup can be tied to the exact
 * CTA, landing variant and campaign.
 */
export async function trackCtaClick(placement: string, variantOverride?: string) {
  if (typeof window === "undefined") return;
  const ctx = captureUtmFromUrl() ?? getUtmContext();
  const attribution: CtaAttribution = {
    placement: placement.slice(0, 48),
    variant: variantOverride ?? ctx?.variant ?? "site",
    landing_path: window.location.pathname.slice(0, 200),
    utm_source: ctx?.utm_source ?? null,
    utm_medium: ctx?.utm_medium ?? null,
    utm_campaign: ctx?.utm_campaign ?? null,
    utm_content: ctx?.utm_content ?? null,
    clicked_at: new Date().toISOString(),
  };
  safeSet(CTA_KEY, JSON.stringify(attribution));

  // Per-visitor funnel step (deduped) + raw per-click row for CTA volume.
  void trackFunnelStep("cta_click");
  try {
    await supabase.from("ad_creative_events").insert({
      experiment: FUNNEL_EXPERIMENT,
      variant: attribution.variant,
      creative_id: `cta:${attribution.placement}`,
      event: "cta_click_raw",
      visitor_id: getVisitorId(),
      utm_source: attribution.utm_source,
      utm_medium: attribution.utm_medium,
      utm_campaign: attribution.utm_campaign,
    });
  } catch {
    /* analytics must never break the CTA */
  }
}

/**
 * Attribute a completed signup to the CTA that produced it. Called once per
 * account from the auth store, alongside the deduped `signup` funnel step.
 */
export async function trackSignupAttribution(userId: string) {
  if (typeof window === "undefined") return;
  const cta = getCtaAttribution();
  const ctx = getUtmContext();
  const key = `pp_signup_attributed:${userId}`;
  if (safeGet(key)) return;
  safeSet(key, new Date().toISOString());

  try {
    await supabase.from("ad_creative_events").insert({
      experiment: FUNNEL_EXPERIMENT,
      variant: cta?.variant ?? ctx?.variant ?? "site",
      creative_id: cta ? `cta:${cta.placement}` : "cta:none",
      event: "signup_attributed",
      visitor_id: getVisitorId(),
      user_id: userId,
      utm_source: cta?.utm_source ?? ctx?.utm_source ?? null,
      utm_medium: cta?.utm_medium ?? ctx?.utm_medium ?? null,
      utm_campaign: cta?.utm_campaign ?? ctx?.utm_campaign ?? null,
    });
  } catch {
    /* ignore */
  }
}

/* ------------------------------------------------------------------ *
 * Landing ad preview engagement
 *
 * Interactions with the embedded auto-play ad on the landing page are
 * recorded so we can measure whether the creative actually drives the
 * overlaid sign-up CTA. Stored in the same event table under a dedicated
 * experiment so funnel and creative reports stay clean.
 * ------------------------------------------------------------------ */

export const AD_PREVIEW_EXPERIMENT = "landing_ad_preview";

export type AdPreviewEvent =
  | "impression"
  | "autoplay_started"
  | "autoplay_blocked"
  | "unmute"
  | "mute"
  | "complete"
  | "reduced_motion_hold"
  | "manual_play"
  | "cta_click"
  | "view_depth_25"
  | "view_depth_50"
  | "view_depth_75"
  | "view_depth_100"
  | "captions_on"
  | "captions_off";

/** Visibility milestones (fraction of the ad in view), tracked once each. */
export const AD_VIEW_DEPTH_MILESTONES = [0.25, 0.5, 0.75, 1] as const;

/** Fire-once-per-browser events (impressions, first completion, view depth). */
const ONCE_EVENTS: AdPreviewEvent[] = [
  "impression",
  "autoplay_started",
  "complete",
  "view_depth_25",
  "view_depth_50",
  "view_depth_75",
  "view_depth_100",
];


/**
 * Record an ad preview interaction. Best-effort — analytics must never break
 * playback or the CTA.
 */
export async function trackAdPreviewEvent(
  event: AdPreviewEvent,
  creativeId = "landing-hero-ad",
) {
  if (typeof window === "undefined") return;
  if (ONCE_EVENTS.includes(event)) {
    const key = `pp_ad_preview:${creativeId}:${event}`;
    if (safeGet(key)) return;
    safeSet(key, new Date().toISOString());
  }

  const ctx = getUtmContext();
  try {
    await supabase.from("ad_creative_events").insert({
      experiment: AD_PREVIEW_EXPERIMENT,
      variant: ctx?.variant ?? "site",
      creative_id: creativeId,
      event,
      visitor_id: getVisitorId(),
      utm_source: ctx?.utm_source ?? null,
      utm_medium: ctx?.utm_medium ?? null,
      utm_campaign: ctx?.utm_campaign ?? null,
    });
  } catch {
    /* ignore */
  }
}

/* ------------------------------------------------------------------ *
 * PumpPilot wallet funnel
 *
 * Tracks the path from "connected something" to "active in-app wallet":
 * created -> backup confirmed -> unlocked -> removed. Only step names and
 * UTM attribution are recorded — never addresses, passwords or phrases.
 * ------------------------------------------------------------------ */

export const WALLET_EXPERIMENT = "wallet_funnel";

export type WalletFunnelStep =
  | "wallet_create_started"
  | "wallet_created"
  | "wallet_backup_confirmed"
  | "wallet_unlocked"
  | "wallet_locked_idle"
  | "wallet_password_rotated"
  | "wallet_removed";

export const WALLET_FUNNEL_STEPS: { step: WalletFunnelStep; label: string }[] = [
  { step: "wallet_create_started", label: "Started creation" },
  { step: "wallet_created", label: "Wallet created" },
  { step: "wallet_backup_confirmed", label: "Backup confirmed" },
  { step: "wallet_unlocked", label: "Unlocked (active)" },
  { step: "wallet_locked_idle", label: "Auto-locked" },
  { step: "wallet_password_rotated", label: "Password changed" },
  { step: "wallet_removed", label: "Wallet removed" },
];

/** Steps that only make sense once per browser for conversion reporting. */
const WALLET_ONCE_STEPS: WalletFunnelStep[] = [
  "wallet_create_started",
  "wallet_created",
  "wallet_backup_confirmed",
];

/**
 * Record a wallet funnel step. Best-effort — analytics must never block or
 * break a wallet action.
 */
export async function trackWalletStep(
  step: WalletFunnelStep,
  detail?: { method?: string; userId?: string | null },
) {
  if (typeof window === "undefined") return;
  if (WALLET_ONCE_STEPS.includes(step)) {
    const key = `pp_wallet_funnel:${step}`;
    if (safeGet(key)) return;
    safeSet(key, new Date().toISOString());
  }

  const ctx = getUtmContext();
  try {
    await supabase.from("ad_creative_events").insert({
      experiment: WALLET_EXPERIMENT,
      variant: ctx?.variant ?? "site",
      creative_id: detail?.method ?? "pump_wallet",
      event: step,
      visitor_id: getVisitorId(),
      user_id: detail?.userId ?? null,
      utm_source: ctx?.utm_source ?? null,
      utm_medium: ctx?.utm_medium ?? null,
      utm_campaign: ctx?.utm_campaign ?? null,
    });
  } catch {
    /* ignore */
  }
}
