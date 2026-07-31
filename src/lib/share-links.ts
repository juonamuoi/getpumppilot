import { getAsset } from "./mock-data";
import { SITE_URL } from "./structured-data";

/**
 * UTM-safe sharing links.
 *
 * Crawlers key their preview cache on the *exact* URL that was shared, so a
 * naive `?utm_source=x` link makes Facebook/X/LinkedIn scrape a URL that is
 * not the canonical one. That is fine — and desirable for attribution — only
 * as long as the shared page:
 *
 *  1. keeps a self-referencing `<link rel="canonical">` WITHOUT the UTM query
 *     (so link equity consolidates on one URL and the tracked variant is never
 *     indexed separately), and
 *  2. keeps `og:url` pointed at that same clean canonical, so the preview card
 *     renders the canonical title/description/image regardless of parameters.
 *
 * This module builds those links from a small allowlist of shareable routes and
 * refuses to emit UTM parameters for any path that is not covered, so no share
 * button can accidentally create an indexable duplicate of a gated route.
 */

export type ShareChannel =
  | "x"
  | "linkedin"
  | "facebook"
  | "reddit"
  | "whatsapp"
  | "telegram"
  | "email"
  | "copy";

/** Token detail pages: `/asset/<lowercase symbol>`. */
export type AssetSharePath = `/asset/${string}`;

export type StaticSharePath = "/" | "/dashboard" | "/journal";

export type ShareablePath = StaticSharePath | AssetSharePath;

export type ShareTarget = {
  path: ShareablePath;
  /** Clean canonical URL — what the page declares and what gets indexed. */
  canonical: string;
  label: string;
  /** Text used as the tweet/post body and email subject. */
  title: string;
  summary: string;
  /** utm_campaign default for this surface. */
  campaign: string;
};

export const SHARE_TARGETS: Record<StaticSharePath, ShareTarget> = {

  "/": {
    path: "/",
    canonical: `${SITE_URL}/`,
    label: "Homepage",
    title: "PumpPilot AI — Spot momentum. Control risk. Trade smarter.",
    summary:
      "Explainable crypto momentum scores, a paper-trading desk and hard risk controls. Live execution stays locked — simulation only.",
    campaign: "share_home",
  },
  "/dashboard": {
    path: "/dashboard",
    canonical: `${SITE_URL}/dashboard`,
    label: "Dashboard",
    title: "PumpPilot AI Dashboard — momentum, portfolio health and risk",
    summary:
      "See explainable momentum scores, portfolio health and stop-loss/position-sizing guidance in one paper-trading dashboard.",
    campaign: "share_dashboard",
  },
  "/journal": {
    path: "/journal",
    canonical: `${SITE_URL}/journal`,
    label: "Trade Journal",
    title: "PumpPilot AI Trade Journal — measure your paper trading edge",
    summary:
      "Win rate, expectancy, profit factor and equity curve for every simulated trade. Demo data, real discipline.",
    campaign: "share_journal",
  },
};

/**
 * Token detail share target, derived from the same ASSETS data the page
 * renders so the copy always matches the token and the canonical always
 * matches the route's `<link rel="canonical">`.
 */
export function assetShareTarget(symbol: string): ShareTarget | null {
  const asset = getAsset(symbol);
  if (!asset) return null;
  const slug = asset.symbol.toLowerCase();
  return {
    path: `/asset/${slug}`,
    canonical: `${SITE_URL}/asset/${slug}`,
    label: `${asset.symbol} token page`,
    title: `${asset.name} (${asset.symbol}) momentum — PumpPilot AI`,
    summary: `Explainable momentum score, chart and paper trading for ${asset.name} (${asset.symbol}) on PumpPilot AI. Demo data — not financial advice.`,
    campaign: `share_asset_${slug}`,
  };
}

/** Resolve any shareable path (static surface or token detail page). */
export function getShareTarget(path: string): ShareTarget | null {
  if (Object.prototype.hasOwnProperty.call(SHARE_TARGETS, path)) {
    return SHARE_TARGETS[path as StaticSharePath];
  }
  const match = /^\/asset\/([A-Za-z0-9]+)$/.exec(path);
  return match ? assetShareTarget(match[1]) : null;
}

export const isShareablePath = (p: string): p is ShareablePath => getShareTarget(p) !== null;


/** Parameters we are willing to append. Anything else is dropped. */
export type UtmParams = {
  source: string;
  medium: string;
  campaign: string;
  content?: string;
  term?: string;
};

const SAFE = /[^a-z0-9_\-.]/g;

/** utm values must be lowercase, short and free of anything needing escaping. */
export function normalizeUtmValue(value: string, fallback = ""): string {
  const v = (value ?? "").toString().trim().toLowerCase().replace(/\s+/g, "_").replace(SAFE, "");
  return (v || fallback).slice(0, 64);
}

export const CHANNEL_PRESETS: Record<
  ShareChannel,
  { label: string; source: string; medium: string }
> = {
  x: { label: "X / Twitter", source: "x", medium: "social" },
  linkedin: { label: "LinkedIn", source: "linkedin", medium: "social" },
  facebook: { label: "Facebook", source: "facebook", medium: "social" },
  reddit: { label: "Reddit", source: "reddit", medium: "social" },
  whatsapp: { label: "WhatsApp", source: "whatsapp", medium: "messaging" },
  telegram: { label: "Telegram", source: "telegram", medium: "messaging" },
  email: { label: "Email", source: "email", medium: "email" },
  copy: { label: "Copy link", source: "direct", medium: "referral" },
};

/**
 * Build the tracked URL for a shareable route.
 *
 * Returns the bare canonical when the path is not shareable, or when every
 * UTM value normalizes away — never a URL with empty parameters.
 */
export function buildShareUrl(path: string, utm: Partial<UtmParams>): string {
  const target = getShareTarget(path);
  if (!target) {
    // Unknown/gated route: hand back a clean URL rather than an indexable
    // tracked duplicate.
    const clean = path.startsWith("/") ? path : `/${path}`;
    return `${SITE_URL}${clean === "/" ? "/" : clean.replace(/\/+$/, "")}`;
  }

  const source = normalizeUtmValue(utm.source ?? "");
  const medium = normalizeUtmValue(utm.medium ?? "");
  const campaign = normalizeUtmValue(utm.campaign ?? "", target.campaign);
  const content = normalizeUtmValue(utm.content ?? "");
  const term = normalizeUtmValue(utm.term ?? "");

  if (!source && !medium) return target.canonical;

  const url = new URL(target.canonical);
  if (source) url.searchParams.set("utm_source", source);
  if (medium) url.searchParams.set("utm_medium", medium);
  if (campaign) url.searchParams.set("utm_campaign", campaign);
  if (content) url.searchParams.set("utm_content", content);
  if (term) url.searchParams.set("utm_term", term);
  return url.toString();
}

export function buildChannelShareUrl(
  path: ShareablePath,
  channel: ShareChannel,
  overrides: Partial<UtmParams> = {},
): string {
  const preset = CHANNEL_PRESETS[channel];
  return buildShareUrl(path, {
    source: preset.source,
    medium: preset.medium,
    campaign: getShareTarget(path)?.campaign,
    ...overrides,
  });
}


/** The intent URL that actually opens the share sheet for a channel. */
export function channelIntentUrl(
  channel: ShareChannel,
  shareUrl: string,
  target: ShareTarget,
): string | null {
  const u = encodeURIComponent(shareUrl);
  const t = encodeURIComponent(target.title);
  const s = encodeURIComponent(target.summary);
  switch (channel) {
    case "x":
      return `https://twitter.com/intent/tweet?url=${u}&text=${t}`;
    case "linkedin":
      return `https://www.linkedin.com/sharing/share-offsite/?url=${u}`;
    case "facebook":
      return `https://www.facebook.com/sharer/sharer.php?u=${u}`;
    case "reddit":
      return `https://www.reddit.com/submit?url=${u}&title=${t}`;
    case "whatsapp":
      return `https://wa.me/?text=${encodeURIComponent(`${target.title} ${shareUrl}`)}`;
    case "telegram":
      return `https://t.me/share/url?url=${u}&text=${t}`;
    case "email":
      return `mailto:?subject=${t}&body=${s}%0A%0A${u}`;
    case "copy":
      return null;
  }
}

export type SharePreviewCheck = {
  ok: boolean;
  canonical: string;
  ogUrl: string;
  /** True when the tracked URL differs from the canonical (expected). */
  tracked: boolean;
  notes: string[];
};

/**
 * Explain why a tracked link is still SEO-safe, and catch the two ways it
 * could stop being safe (canonical drifting off-page, or og:url carrying UTM).
 */
export function checkSharePreview(path: ShareablePath, shareUrl: string): SharePreviewCheck {
  const target = getShareTarget(path);
  const notes: string[] = [];
  let ok = true;

  if (!target) {
    return {
      ok: false,
      canonical: "",
      ogUrl: "",
      tracked: false,
      notes: ["This route is not shareable, so no tracked link is generated."],
    };
  }

  const canonical = target.canonical;
  const ogUrl = target.canonical;


  if (canonical.includes("utm_")) {
    ok = false;
    notes.push("Canonical carries UTM parameters — the tracked URL could be indexed separately.");
  }
  if (ogUrl.includes("utm_")) {
    ok = false;
    notes.push("og:url carries UTM parameters — previews would attribute to the tracked URL.");
  }
  if (!shareUrl.startsWith(canonical.replace(/\/$/, "")) && !shareUrl.startsWith(canonical)) {
    ok = false;
    notes.push("Share URL does not point at this page's canonical origin/path.");
  }
  if (ok) {
    notes.push("Canonical and og:url stay clean, so previews render this page's own card.");
    notes.push("Crawlers consolidate the tracked URL onto the canonical — no duplicate indexing.");
  }

  return { ok, canonical, ogUrl, tracked: shareUrl !== canonical, notes };
}
