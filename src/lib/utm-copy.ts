import type { LandingVariant } from "./landing-variants";
import { getUtmContext } from "./funnel";

/**
 * Channel-aware copy overlays. The landing variant still owns the base
 * message; these overlays only re-frame the hero and compliance line so the
 * wording matches the promise made in the ad the visitor just clicked.
 */
export type UtmOverlay = {
  /** Short internal label shown in the debug/QA badge */
  label: string;
  badge?: string;
  headline?: string;
  headlineAccent?: string;
  subhead?: string;
  complianceLine?: string;
  ctaPrimary?: string;
};

export type TailoredCopy = {
  badge: string;
  headline: string;
  headlineAccent: string;
  subhead: string;
  complianceLine: string;
  ctaPrimary: string;
  /** Which overlay matched, if any (source overlay wins over medium) */
  matched: string | null;
  source: string | null;
  medium: string | null;
};

const norm = (v: string | null | undefined) =>
  (v ?? "").toString().trim().toLowerCase().slice(0, 64);

/** Paid-social platforms need the strongest "no guarantees" framing. */
const SOCIAL_COMPLIANCE =
  "Educational simulation only — not financial advice. Momentum scores are probabilistic and can be wrong. Crypto is volatile and you can lose all of your capital. Live execution is disabled and locked: everything here is paper trading on mock and demo data.";

const SEARCH_COMPLIANCE =
  "PumpPilot AI is a research and simulation tool, not investment advice. Scores are probabilistic estimates, not predictions of returns. Past and simulated performance does not indicate future results and you can lose all of your capital. Trading is paper-only; live execution stays disabled and locked.";

const DEV_COMPLIANCE =
  "Signals are probabilistic model output, not investment advice. Treat every score as an input to your own research. You can lose all of your capital. The execution adapter is disabled and locked — the API and app return paper-trading results on mock and demo data.";

const EMAIL_COMPLIANCE =
  "You are reading an educational product update, not investment advice. Momentum scores are probabilistic and can be wrong, and you can lose all of your capital. All trading inside PumpPilot AI is paper trading; live execution is disabled and locked.";

/** utm_source overlays (most specific). */
export const SOURCE_OVERLAYS: Record<string, UtmOverlay> = {
  google: {
    label: "Google Search",
    badge: "Explainable momentum scoring",
    subhead:
      "See exactly which rules fired, how close each token was to missing, and replay any window before you trust a signal. Free to start, paper trading only.",
    complianceLine: SEARCH_COMPLIANCE,
    ctaPrimary: "Start free — no card",
  },
  bing: {
    label: "Bing Search",
    badge: "Explainable momentum scoring",
    complianceLine: SEARCH_COMPLIANCE,
    ctaPrimary: "Start free — no card",
  },
  reddit: {
    label: "Reddit",
    badge: "No black boxes, no promises",
    headlineAccent: "with the reasoning attached",
    subhead:
      "Every score shows the rules behind it and the near-miss risk. Nothing is guaranteed — you get the logic, you make the call.",
    complianceLine: SOCIAL_COMPLIANCE,
    ctaPrimary: "Try the scanner free",
  },
  x: {
    label: "X / Twitter",
    badge: "Momentum, scored and explained",
    subhead:
      "Scan majors and DEMO small-caps, see why each score moved, and paper trade the setup before risking anything.",
    complianceLine: SOCIAL_COMPLIANCE,
    ctaPrimary: "Scan free in 60 seconds",
  },
  twitter: {
    label: "X / Twitter",
    badge: "Momentum, scored and explained",
    complianceLine: SOCIAL_COMPLIANCE,
    ctaPrimary: "Scan free in 60 seconds",
  },
  tiktok: {
    label: "TikTok",
    badge: "60-second setup",
    subhead:
      "Connect a wallet read-only, run one scan, and see the reasoning behind every momentum score. Paper trading only — no real orders, ever.",
    complianceLine: SOCIAL_COMPLIANCE,
    ctaPrimary: "Run my first scan",
  },
  youtube: {
    label: "YouTube",
    badge: "Watch it, then run it yourself",
    complianceLine: SOCIAL_COMPLIANCE,
    ctaPrimary: "Try it free",
  },
  facebook: {
    label: "Meta",
    badge: "Risk controls first",
    complianceLine: SOCIAL_COMPLIANCE,
    ctaPrimary: "Start free",
  },
  instagram: {
    label: "Meta",
    badge: "Risk controls first",
    complianceLine: SOCIAL_COMPLIANCE,
    ctaPrimary: "Start free",
  },
  linkedin: {
    label: "LinkedIn",
    badge: "Auditable by design",
    subhead:
      "Rule-based momentum with full audit trails, risk bounds and exportable reports — built for people who have to justify a process.",
    complianceLine: SEARCH_COMPLIANCE,
    ctaPrimary: "Start free",
  },
  producthunt: {
    label: "Product Hunt",
    badge: "Hello, Product Hunt 👋",
    subhead:
      "Explainable momentum scores, a rule builder with replay, an MCP server and a public API. Free tier, paper trading only.",
    complianceLine: DEV_COMPLIANCE,
    ctaPrimary: "Start free",
  },
  github: {
    label: "Developers",
    badge: "API + MCP included",
    subhead:
      "Pull momentum scores and near-miss breakdowns over the public API or straight into your agent via MCP. Free tier, paper trading only.",
    complianceLine: DEV_COMPLIANCE,
    ctaPrimary: "Get an API key",
  },
  hackernews: {
    label: "Hacker News",
    badge: "Rules you can read",
    complianceLine: DEV_COMPLIANCE,
    ctaPrimary: "Start free",
  },
  newsletter: {
    label: "Newsletter",
    badge: "From the PumpPilot newsletter",
    complianceLine: EMAIL_COMPLIANCE,
    ctaPrimary: "Open my dashboard",
  },
};

/** utm_medium overlays (fallback when the source is unknown). */
export const MEDIUM_OVERLAYS: Record<string, UtmOverlay> = {
  cpc: {
    label: "Paid search",
    complianceLine: SEARCH_COMPLIANCE,
    ctaPrimary: "Start free — no card",
  },
  ppc: { label: "Paid search", complianceLine: SEARCH_COMPLIANCE },
  paid_social: { label: "Paid social", complianceLine: SOCIAL_COMPLIANCE },
  social: { label: "Social", complianceLine: SOCIAL_COMPLIANCE },
  display: {
    label: "Display",
    complianceLine: SOCIAL_COMPLIANCE,
    ctaPrimary: "See a live example",
  },
  video: { label: "Video", complianceLine: SOCIAL_COMPLIANCE },
  email: {
    label: "Email",
    badge: "Picking up where you left off",
    complianceLine: EMAIL_COMPLIANCE,
    ctaPrimary: "Continue setup",
  },
  affiliate: {
    label: "Affiliate",
    complianceLine: `${SOCIAL_COMPLIANCE} This link may earn the referrer a commission.`,
  },
  referral: {
    label: "Referral",
    badge: "Invited by a PumpPilot user",
    complianceLine: SOCIAL_COMPLIANCE,
  },
  organic: { label: "Organic", complianceLine: SEARCH_COMPLIANCE },
};

/** Reads UTM tags from the current URL, falling back to stored first-touch. */
export function readUtmSourceMedium(): { source: string | null; medium: string | null } {
  if (typeof window === "undefined") return { source: null, medium: null };
  const params = new URLSearchParams(window.location.search);
  const urlSource = norm(params.get("utm_source"));
  const urlMedium = norm(params.get("utm_medium"));
  if (urlSource || urlMedium) {
    return { source: urlSource || null, medium: urlMedium || null };
  }
  const stored = getUtmContext();
  return {
    source: norm(stored?.utm_source) || null,
    medium: norm(stored?.utm_medium) || null,
  };
}

/**
 * Merges the landing variant's base copy with the overlay matching the
 * detected traffic source. Source overlays win; medium overlays fill gaps.
 */
export function tailorCopy(
  variant: LandingVariant,
  utm: { source: string | null; medium: string | null },
): TailoredCopy {
  const source = norm(utm.source) || null;
  const medium = norm(utm.medium) || null;

  const sourceOverlay = source ? SOURCE_OVERLAYS[source] : undefined;
  const mediumOverlay = medium ? MEDIUM_OVERLAYS[medium] : undefined;

  const pick = <K extends keyof UtmOverlay>(key: K, fallback: string): string =>
    (sourceOverlay?.[key] as string | undefined) ??
    (mediumOverlay?.[key] as string | undefined) ??
    fallback;

  return {
    badge: pick("badge", variant.badge),
    headline: pick("headline", variant.headline),
    headlineAccent: pick("headlineAccent", variant.headlineAccent),
    subhead: pick("subhead", variant.subhead),
    complianceLine: pick("complianceLine", variant.complianceLine),
    ctaPrimary: pick("ctaPrimary", variant.ctaPrimary),
    matched: sourceOverlay?.label ?? mediumOverlay?.label ?? null,
    source,
    medium,
  };
}
