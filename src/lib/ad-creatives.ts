import { supabase } from "@/integrations/supabase/client";

export const AD_EXPERIMENT = "landing_hero";

export type AdCreative = {
  /** Stable id used in reports and as the utm_content value in the ad */
  id: string;
  label: string;
  headline: string;
  headlineAccent: string;
  /** Ad description / landing subhead */
  description: string;
  cta: string;
};

/** Creative pool per landing variant. Keys must match landing variant slugs. */
export const AD_CREATIVES: Record<string, AdCreative[]> = {
  "explainable-ai": [
    {
      id: "xai-a",
      label: "Anti black-box",
      headline: "Stop trusting black-box crypto calls.",
      headlineAccent: "See exactly why the signal fired.",
      description:
        "PumpPilot AI scores momentum on BTC, ETH, SOL, BNB and demo small-caps — and shows the exact rules, thresholds and margins behind every score. Paper trade it first. Free, no card.",
      cta: "Start free",
    },
    {
      id: "xai-b",
      label: "Receipts angle",
      headline: "Every crypto signal comes",
      headlineAccent: "with its receipts.",
      description:
        "Rules that passed, rules that nearly failed, and how much slack is left — on every momentum score. Test it in paper mode before you believe it. Free, no card.",
      cta: "Start free",
    },
    {
      id: "xai-c",
      label: "Question hook",
      headline: "Why did that signal fire?",
      headlineAccent: "Now you can actually answer.",
      description:
        "Explainable momentum scoring, historical replays and a risk frontier chart — so you tune thresholds on evidence, not vibes. Start free in paper mode.",
      cta: "Start free",
    },
  ],
  "risk-first": [
    {
      id: "risk-a",
      label: "Zero risk",
      headline: "Learn crypto momentum",
      headlineAccent: "without risking a cent.",
      description:
        "Live trading is switched off and locked. Practise with simulated capital, track win rate and expectancy in a real journal, and only act elsewhere once your system works.",
      cta: "Start free",
    },
    {
      id: "risk-b",
      label: "Burned trader",
      headline: "Blew up an account before?",
      headlineAccent: "Rebuild the process first.",
      description:
        "A full paper desk with PnL, drawdown and an equity curve you can't argue with — plus hard risk controls on by default. No card, no live trades, no keys.",
      cta: "Start free",
    },
    {
      id: "risk-c",
      label: "Discipline",
      headline: "Simulated capital.",
      headlineAccent: "Real discipline.",
      description:
        "Win rate, profit factor and expectancy per strategy, so you fix the process instead of the story. Everything runs in paper mode with mock and demo data.",
      cta: "Start free",
    },
  ],
  beginner: [
    {
      id: "beg-a",
      label: "Plain English",
      headline: "Crypto momentum,",
      headlineAccent: "explained like a human would.",
      description:
        "No jargon walls. Every signal becomes a sentence you can read, an AI Copilot answers your questions, and you practise with fake money until it clicks.",
      cta: "Start free",
    },
    {
      id: "beg-b",
      label: "3-minute setup",
      headline: "Your first crypto scan,",
      headlineAccent: "three minutes from now.",
      description:
        "A guided wizard picks sensible defaults, the Learn Hub explains each idea as you hit it, and nothing you do risks real money. Free forever plan.",
      cta: "Start free",
    },
    {
      id: "beg-c",
      label: "No wallet",
      headline: "No wallet. No jargon.",
      headlineAccent: "No money at risk.",
      description:
        "Practise crypto momentum trading in a safe simulator with an AI coach that tells you when not to take the trade. Start free — nothing to install.",
      cta: "Start free",
    },
  ],
  quant: [
    {
      id: "quant-a",
      label: "Build & replay",
      headline: "Build the rule set.",
      headlineAccent: "Replay it. Then trust it.",
      description:
        "Define thresholds and operators, replay them over historical windows, and read the matches-versus-near-miss frontier before you commit. Every change is audit-logged.",
      cta: "Start free",
    },
    {
      id: "quant-b",
      label: "API first",
      headline: "Momentum scores",
      headlineAccent: "with an API and an audit log.",
      description:
        "Public momentum endpoint, embeddable widget and OAuth-protected MCP tools for agents — with rate limits, correlation IDs and one-click rollback on rule changes.",
      cta: "Start free",
    },
    {
      id: "quant-c",
      label: "Frontier",
      headline: "Find the honest",
      headlineAccent: "matches-vs-fragility point.",
      description:
        "Sweep threshold levels, plot matches against near-miss risk, and let risk bounds block unsafe loosening automatically. Free tier includes the scanner and replays.",
      cta: "Start free",
    },
  ],
};

const VISITOR_KEY = "pp_visitor_id";
const ASSIGN_KEY = "pp_creative_assignment";
const SIGNUP_KEY = "pp_creative_signup_logged";

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

export function getVisitorId(): string {
  let id = safeGet(VISITOR_KEY);
  if (!id) {
    id = `v_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
    safeSet(VISITOR_KEY, id);
  }
  return id;
}

export type Assignment = {
  variant: string;
  creativeId: string;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
};

/**
 * Assign (and persist) a creative for a landing variant. `utm_content` in the
 * ad URL forces a specific creative so paid traffic maps 1:1 to the ad copy.
 */
export function assignCreative(variant: string): { creative: AdCreative; assignment: Assignment } {
  const pool = AD_CREATIVES[variant] ?? AD_CREATIVES["explainable-ai"];
  const params =
    typeof window === "undefined"
      ? new URLSearchParams()
      : new URLSearchParams(window.location.search);

  const forcedId = params.get("utm_content") ?? params.get("creative");
  const forced = forcedId ? pool.find((c) => c.id === forcedId) : undefined;

  let creative = forced;
  if (!creative) {
    const stored = safeGet(`${ASSIGN_KEY}:${variant}`);
    creative = stored ? pool.find((c) => c.id === stored) : undefined;
  }
  if (!creative) {
    creative = pool[Math.floor(Math.random() * pool.length)];
  }
  safeSet(`${ASSIGN_KEY}:${variant}`, creative.id);

  const assignment: Assignment = {
    variant,
    creativeId: creative.id,
    utm_source: params.get("utm_source"),
    utm_medium: params.get("utm_medium"),
    utm_campaign: params.get("utm_campaign"),
  };
  safeSet(ASSIGN_KEY, JSON.stringify(assignment));
  return { creative, assignment };
}

export function getLastAssignment(): Assignment | null {
  const raw = safeGet(ASSIGN_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Assignment;
  } catch {
    return null;
  }
}

export async function trackCreativeEvent(
  event: "impression" | "click" | "signup",
  assignment: Assignment,
  userId?: string | null,
) {
  try {
    await supabase.from("ad_creative_events").insert({
      experiment: AD_EXPERIMENT,
      variant: assignment.variant,
      creative_id: assignment.creativeId,
      event,
      visitor_id: getVisitorId(),
      user_id: userId ?? null,
      utm_source: assignment.utm_source,
      utm_medium: assignment.utm_medium,
      utm_campaign: assignment.utm_campaign,
      utm_content: assignment.creativeId,
      placement: `creative:${event}`,
    });
  } catch {
    /* analytics is best-effort and must never break the page */
  }
}

/** Fires once per browser after the visitor signs up. */
export async function trackSignupOnce(userId: string) {
  if (safeGet(SIGNUP_KEY)) return;
  const assignment = getLastAssignment();
  if (!assignment) return;
  safeSet(SIGNUP_KEY, "1");
  await trackCreativeEvent("signup", assignment, userId);
}
