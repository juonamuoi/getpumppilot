export type LandingVariant = {
  slug: string;
  /** Short internal name used when wiring the ad set */
  audience: string;
  /** Where this variant is meant to run */
  channel: string;
  badge: string;
  headline: string;
  headlineAccent: string;
  subhead: string;
  bullets: { title: string; desc: string }[];
  proof: string[];
  /** Channel-appropriate compliance / risk line shown under the CTA */
  complianceLine: string;
  ctaPrimary: string;
  ctaSecondary: string;
  objection: { q: string; a: string }[];
  metaTitle: string;
  metaDescription: string;
};

export const COMPLIANCE_FOOTER =
  "PumpPilot AI is an educational simulation platform. It is not investment, financial, legal or tax advice. Momentum scores are probabilistic and can be wrong. Past and simulated performance does not predict future results. Crypto markets are volatile and you can lose all of your capital. Live execution is disabled and locked — all trading inside PumpPilot AI is paper trading with mock and demo data. We never request or store seed phrases or private keys.";

export const LANDING_VARIANTS: LandingVariant[] = [
  {
    slug: "explainable-ai",
    audience: "Signal-skeptics / research-first investors",
    channel: "Google Search — “AI crypto signals”, “explainable AI trading”",
    badge: "Every score shows its reasoning",
    headline: "Stop trusting black-box crypto calls.",
    headlineAccent: "See exactly why the signal fired.",
    subhead:
      "PumpPilot AI scores momentum on BTC, ETH, SOL, BNB and demo small-caps — and shows the exact rules, thresholds and margins behind every score. Paper trade it first. Free, no card.",
    bullets: [
      {
        title: "Rule-level explanations",
        desc: "Each signal lists the rules that passed, the ones that nearly failed, and how much slack is left.",
      },
      {
        title: "Backtest before you believe",
        desc: "Replay your thresholds over historical windows and see matches vs near-miss risk on one chart.",
      },
      {
        title: "Risk controls that bite",
        desc: "Position caps, fragility bounds and rollback on every rule change — with a full audit trail.",
      },
    ],
    proof: [
      "No seed phrases, ever",
      "Live execution locked",
      "Free tier with real features",
    ],
    complianceLine:
      "Educational simulation only — not investment advice. Signals are probabilistic; you can lose all capital. Paper trading only; live execution is disabled.",
    ctaPrimary: "Start free",
    ctaSecondary: "See how scoring works",
    objection: [
      {
        q: "Is this another signal group?",
        a: "No. There is no “buy now” alert. You get a transparent score, the rules behind it, and a sandbox to test whether your own thresholds hold up.",
      },
      {
        q: "Do I need a wallet?",
        a: "No. Paper trading works with zero wallet setup, and any wallet you do connect is read-only.",
      },
    ],
    metaTitle: "Explainable AI Crypto Signals — See the Rules | PumpPilot AI",
    metaDescription:
      "See the exact rules behind every crypto momentum score. Paper trade, backtest and control risk with PumpPilot AI. Start free — no card, no seed phrases.",
  },
  {
    slug: "risk-first",
    audience: "Burned traders / risk-conscious",
    channel: "Meta & X — retargeting, “lost money trading” audiences",
    badge: "Paper trading by default",
    headline: "Learn crypto momentum",
    headlineAccent: "without risking a cent.",
    subhead:
      "Live trading is switched off and locked inside PumpPilot AI. You practise with simulated capital, track win rate and expectancy in a real trade journal, and only act elsewhere once your system actually works.",
    bullets: [
      {
        title: "Simulated capital, real discipline",
        desc: "Full paper portfolio with orders, PnL, drawdown and an equity curve you can’t argue with.",
      },
      {
        title: "A journal that grades you",
        desc: "Win rate, profit factor and expectancy per strategy, so you fix the process instead of the story.",
      },
      {
        title: "Safety rails on by default",
        desc: "Phishing detection, wallet threat scans and read-only connections. We never touch your keys.",
      },
    ],
    proof: [
      "$0 at risk — simulation only",
      "Read-only wallet checks",
      "Cancel anytime, free tier stays",
    ],
    complianceLine:
      "Simulated trading with mock and demo data. Not financial advice. Returns are not guaranteed and real crypto markets can lose you all of your capital.",
    ctaPrimary: "Start free",
    ctaSecondary: "Tour the paper desk",
    objection: [
      {
        q: "Will it place real trades?",
        a: "It cannot. The live execution adapter is disabled and the master switch is locked off.",
      },
      {
        q: "What does free include?",
        a: "Dashboard, momentum scanner, 3 alert rules, paper trading, community and the Security Center — forever.",
      },
    ],
    metaTitle: "Practise Crypto Trading Risk-Free — Paper Mode | PumpPilot AI",
    metaDescription:
      "Trade crypto momentum with simulated capital. Live execution is locked off. Track win rate and expectancy in a real journal. Start free with PumpPilot AI.",
  },
  {
    slug: "beginner",
    audience: "Curious beginners",
    channel: "TikTok / Reels / YouTube pre-roll",
    badge: "Plain-English signals",
    headline: "Crypto momentum,",
    headlineAccent: "explained like a human would.",
    subhead:
      "No jargon walls. PumpPilot AI turns every signal into a sentence you can actually read, coaches you with an AI Copilot, and lets you practise with fake money until it clicks.",
    bullets: [
      {
        title: "3-minute setup",
        desc: "A guided wizard picks sensible defaults, so your first scan makes sense on day one.",
      },
      {
        title: "Ask anything",
        desc: "The AI Copilot answers in plain English — including when the honest answer is “don’t take this trade”.",
      },
      {
        title: "Learn Hub built in",
        desc: "Short lessons on momentum, position sizing and risk, tied to what you’re looking at.",
      },
    ],
    proof: ["Free forever tier", "No wallet needed", "Nothing to install"],
    complianceLine:
      "Educational only. Crypto is high risk and volatile — you can lose everything. PumpPilot AI uses mock and demo data and never gives financial advice.",
    ctaPrimary: "Start free",
    ctaSecondary: "Watch a 60-second tour",
    objection: [
      {
        q: "I’ve never traded before — is this for me?",
        a: "Yes. Everything is simulated, and the Learn Hub plus Copilot explain each concept as you hit it.",
      },
      {
        q: "Is it really free?",
        a: "The free plan is permanent and includes scanning, paper trading and alerts. Upgrades are optional.",
      },
    ],
    metaTitle: "Crypto Momentum Explained Simply — Free AI App | PumpPilot AI",
    metaDescription:
      "Learn crypto momentum in plain English with an AI Copilot and free paper trading. No wallet, no jargon, no risk. Start free with PumpPilot AI.",
  },
  {
    slug: "quant",
    audience: "Quant / builder audience",
    channel: "X, Reddit, developer newsletters",
    badge: "Rules, replays and an API",
    headline: "Build the rule set.",
    headlineAccent: "Replay it. Then trust it.",
    subhead:
      "Define thresholds and operators, replay them across historical windows, and read the matches-versus-near-miss frontier before you commit. Every tuning change is audit-logged and one click from rollback.",
    bullets: [
      {
        title: "Frontier analysis",
        desc: "Sweep threshold levels and plot matches against near-miss fragility to find the honest operating point.",
      },
      {
        title: "Tuning audit + rollback",
        desc: "Old value, new value, risk metrics and source recorded on every save. Roll the last batch back instantly.",
      },
      {
        title: "API & MCP access",
        desc: "Momentum scores over HTTP, plus an OAuth-protected MCP server with rate limits and audit logging.",
      },
    ],
    proof: ["Public momentum API", "MCP agent tools", "Embeddable widget"],
    complianceLine:
      "Research and simulation environment. Outputs are probabilistic, use mock and demo data, and are not investment advice. Live execution is disabled by design.",
    ctaPrimary: "Start free",
    ctaSecondary: "Read the API docs",
    objection: [
      {
        q: "Can I pull scores into my own stack?",
        a: "Yes — a public momentum endpoint, an embeddable widget and MCP tools for agents are all available.",
      },
      {
        q: "How are rule changes governed?",
        a: "Risk bounds block unsafe loosening, and every change is logged with before/after metrics and a one-click revert.",
      },
    ],
    metaTitle: "Rule-Based Crypto Momentum, Replays & API | PumpPilot AI",
    metaDescription:
      "Define momentum rules, replay them over historical windows, inspect the risk frontier and pull scores via API or MCP. Start free with PumpPilot AI.",
  },
];

export function getVariant(slug: string): LandingVariant | undefined {
  return LANDING_VARIANTS.find((v) => v.slug === slug);
}
