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
