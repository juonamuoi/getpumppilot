/**
 * Compliant ad copy variant library for A/B testing.
 *
 * Every variant is written against the same compliance rules:
 *  - no performance promises, guaranteed returns, profit claims or urgency scarcity
 *  - no "signals to buy" / financial advice framing
 *  - always educational / simulation framing (paper trading by default)
 *  - never mentions seed phrases, keys or wallet imports
 *
 * `utm_content` for a test should be the variant id, so the placement report
 * (/ads-report) can attribute signups back to the exact headline + body pair.
 */

export type PlacementId =
  | "google_search"
  | "meta_feed"
  | "reddit"
  | "x"
  | "tiktok"
  | "youtube"
  | "linkedin"
  | "display"
  | "email";

export type PlacementSpec = {
  id: PlacementId;
  label: string;
  /** Channel this maps to in UTM tagging */
  utm_source: string;
  utm_medium: string;
  /** Platform character guidance (soft caps used for the QA counters) */
  headlineMax: number;
  bodyMax: number;
  note: string;
};

export type CopyVariant = {
  /** Stable id — use as utm_content */
  id: string;
  headline: string;
  body: string;
  /** Angle label so results can be grouped by message theme */
  angle:
    | "explainability"
    | "risk-first"
    | "beginner"
    | "quant"
    | "objection"
    | "curiosity";
};

export const PLACEMENTS: PlacementSpec[] = [
  {
    id: "google_search",
    label: "Google Search (RSA)",
    utm_source: "google",
    utm_medium: "cpc",
    headlineMax: 30,
    bodyMax: 90,
    note: "Responsive search ad. Headlines ≤30 chars, descriptions ≤90 chars. Avoid financial-promise language — Google restricts crypto ads.",
  },
  {
    id: "meta_feed",
    label: "Meta feed (FB/IG)",
    utm_source: "facebook",
    utm_medium: "paid_social",
    headlineMax: 40,
    bodyMax: 125,
    note: "Headline ≤40 chars, primary text ideally ≤125 chars before the fold. Meta financial-products policy: no return claims.",
  },
  {
    id: "reddit",
    label: "Reddit promoted post",
    utm_source: "reddit",
    utm_medium: "paid_social",
    headlineMax: 90,
    bodyMax: 200,
    note: "Reddit rewards plain, non-hypey copy. Lead with the mechanism, not the outcome.",
  },
  {
    id: "x",
    label: "X / Twitter",
    utm_source: "x",
    utm_medium: "paid_social",
    headlineMax: 70,
    bodyMax: 180,
    note: "Short, declarative. Compliance line lives on the landing page, not in the tweet.",
  },
  {
    id: "tiktok",
    label: "TikTok in-feed",
    utm_source: "tiktok",
    utm_medium: "paid_social",
    headlineMax: 40,
    bodyMax: 100,
    note: "Spoken-language hooks. Never imply earnings; TikTok financial-services policy is strict.",
  },
  {
    id: "youtube",
    label: "YouTube",
    utm_source: "youtube",
    utm_medium: "video",
    headlineMax: 40,
    bodyMax: 90,
    note: "Companion headline + description for in-stream and discovery placements.",
  },
  {
    id: "linkedin",
    label: "LinkedIn single image",
    utm_source: "linkedin",
    utm_medium: "paid_social",
    headlineMax: 70,
    bodyMax: 150,
    note: "Process/audit framing performs best. Speak to people who must justify a method.",
  },
  {
    id: "display",
    label: "Display / banner",
    utm_source: "display",
    utm_medium: "display",
    headlineMax: 30,
    bodyMax: 90,
    note: "Very short. Must still carry the simulation framing.",
  },
  {
    id: "email",
    label: "Email / newsletter",
    utm_source: "newsletter",
    utm_medium: "email",
    headlineMax: 60,
    bodyMax: 200,
    note: "Headline doubles as the subject line. Preview text is the body's first sentence.",
  },
];

export const AD_COPY_VARIANTS: Record<PlacementId, CopyVariant[]> = {
  google_search: [
    { id: "gs-01", angle: "explainability", headline: "Explainable Crypto Scores", body: "See the exact rules behind every momentum score. Paper trading only. Free to start." },
    { id: "gs-02", angle: "explainability", headline: "Why Did That Signal Fire?", body: "Rules passed, rules nearly missed, slack left. Read the reasoning on every score." },
    { id: "gs-03", angle: "risk-first", headline: "Practise Crypto Momentum", body: "Simulated capital, real journal. Live execution stays disabled by default." },
    { id: "gs-04", angle: "risk-first", headline: "Risk Controls On By Default", body: "Position caps, drawdown limits and blocked-order logs. Educational simulation." },
    { id: "gs-05", angle: "beginner", headline: "Crypto Momentum, Explained", body: "Plain-English breakdowns and a guided setup. No wallet needed to look around." },
    { id: "gs-06", angle: "beginner", headline: "Your First Scan In Minutes", body: "Guided wizard, sensible defaults, paper mode. Free plan, no card required." },
    { id: "gs-07", angle: "quant", headline: "Rule Builder With Replay", body: "Set thresholds, replay historic windows, read the near-miss frontier." },
    { id: "gs-08", angle: "quant", headline: "Momentum API + Audit Log", body: "Public endpoint, MCP tools, correlation IDs and one-click rule rollback." },
    { id: "gs-09", angle: "objection", headline: "No Black-Box Crypto Calls", body: "Every score shows its thresholds and margins. Judge the logic yourself." },
    { id: "gs-10", angle: "objection", headline: "We Never Ask For A Phrase", body: "Read-only wallet view, paper trading, no recovery phrase ever requested." },
    { id: "gs-11", angle: "curiosity", headline: "See The Near-Miss Risk", body: "Which tokens almost failed your rules — and by how much. Free to try." },
    { id: "gs-12", angle: "curiosity", headline: "Momentum With Receipts", body: "Scores, reasoning and replays in one dashboard. Simulation only, not advice." },
  ],
  meta_feed: [
    { id: "mf-01", angle: "explainability", headline: "Momentum with the reasoning shown", body: "Every score lists the rules that passed and how close the rest came. Paper trading only — nothing here is financial advice." },
    { id: "mf-02", angle: "explainability", headline: "Read the logic, not a verdict", body: "PumpPilot AI shows thresholds, margins and near-misses behind each momentum score so you can judge it yourself." },
    { id: "mf-03", angle: "risk-first", headline: "Practise with simulated capital", body: "Live execution is off and locked. Build a process with a real journal, win rate and drawdown — without risking money." },
    { id: "mf-04", angle: "risk-first", headline: "Risk limits before returns", body: "Position caps, daily loss limits and a log of every blocked order. Educational simulation, not investment advice." },
    { id: "mf-05", angle: "beginner", headline: "Crypto momentum in plain English", body: "No jargon wall. Each signal becomes a sentence, and an AI copilot answers follow-ups while you practise in paper mode." },
    { id: "mf-06", angle: "beginner", headline: "No wallet. No jargon. No risk.", body: "Explore a full crypto momentum desk with simulated money. Free plan, no card, no recovery phrase ever requested." },
    { id: "mf-07", angle: "quant", headline: "Build the rules. Replay them.", body: "Define thresholds, replay historic windows and read the matches-versus-fragility frontier before you trust anything." },
    { id: "mf-08", angle: "quant", headline: "Auditable momentum scoring", body: "Correlation IDs, audit trails and one-click rollback on every rule change. Simulation-first by design." },
    { id: "mf-09", angle: "objection", headline: "Tired of black-box calls?", body: "See exactly why a score moved — or why it didn't. No promises, no predictions, just the rules and the margins." },
    { id: "mf-10", angle: "objection", headline: "We never ask for a seed phrase", body: "Wallet views are read-only and trading is simulated. Your keys stay yours, always." },
    { id: "mf-11", angle: "curiosity", headline: "What almost triggered today?", body: "The near-miss view shows which tokens sat just under your thresholds, and by how much. Free to explore in paper mode." },
    { id: "mf-12", angle: "curiosity", headline: "Your rules, replayed on history", body: "Change one threshold and watch how past scans would have differed. Educational simulation only." },
  ],
  reddit: [
    { id: "rd-01", angle: "explainability", headline: "A momentum scanner that shows its rules instead of just a number", body: "Each score lists which conditions passed, which nearly failed, and the remaining slack. Paper trading only — no live execution, no advice." },
    { id: "rd-02", angle: "explainability", headline: "Built this because I got tired of black-box crypto signals", body: "Thresholds, operators and margins are all visible, and you can replay any rule set over historical windows before believing it." },
    { id: "rd-03", angle: "risk-first", headline: "Paper trading desk with real risk accounting", body: "Position caps, drawdown limits, a blocked-order log and an equity curve. Live trading stays disabled by default." },
    { id: "rd-04", angle: "risk-first", headline: "Fix the process before you risk the capital", body: "Win rate, profit factor and expectancy per strategy, tracked in a journal. Everything runs on simulated money." },
    { id: "rd-05", angle: "beginner", headline: "If you want to learn momentum without losing money first", body: "Plain-English explanations for each signal, a guided setup, and an AI copilot that will tell you when a setup is weak." },
    { id: "rd-06", angle: "beginner", headline: "No wallet connection required to try it", body: "Explore the scanner, scores and journal in simulation. We never ask for a recovery phrase and never place real orders for you." },
    { id: "rd-07", angle: "quant", headline: "Rule builder, historical replay and a near-miss frontier chart", body: "Sweep threshold levels, plot matches against near-miss fragility, and let risk bounds block unsafe loosening automatically." },
    { id: "rd-08", angle: "quant", headline: "Public momentum API and MCP tools for agents", body: "Rate limits, correlation IDs, audit logs and one-click rollback on rule changes. Free tier includes scanner and replays." },
    { id: "rd-09", angle: "objection", headline: "Not a signal group, not a bot selling returns", body: "It's a scoring and simulation tool. Scores are probabilistic, can be wrong, and are not investment advice." },
    { id: "rd-10", angle: "objection", headline: "Everything is simulated until you decide otherwise", body: "The execution adapter ships disabled and locked, so nothing you test can accidentally hit a real market." },
    { id: "rd-11", angle: "curiosity", headline: "What does your threshold actually cost you in missed matches?", body: "The frontier view plots matches against near-miss risk so you can pick a level on evidence instead of vibes." },
    { id: "rd-12", angle: "curiosity", headline: "Replay yesterday's scan with today's rules", body: "One click re-runs history against your current configuration and diffs what would have fired. Simulation only." },
  ],
  x: [
    { id: "tw-01", angle: "explainability", headline: "Momentum scores that show their work", body: "Rules passed, rules nearly missed, slack remaining — on every score. Paper trading only." },
    { id: "tw-02", angle: "explainability", headline: "Why did that signal fire? Now you can answer.", body: "Thresholds, margins and replays behind every momentum score. Not advice, not a prediction." },
    { id: "tw-03", angle: "risk-first", headline: "Simulated capital. Real discipline.", body: "Journal, drawdown, expectancy and hard risk limits. Live execution disabled by default." },
    { id: "tw-04", angle: "risk-first", headline: "Risk limits you can actually see", body: "Position caps, daily loss caps, and a log of every blocked order. Educational simulation." },
    { id: "tw-05", angle: "beginner", headline: "Learn crypto momentum with fake money first", body: "Plain-English signals, guided setup, AI copilot. Free plan, no card." },
    { id: "tw-06", angle: "beginner", headline: "No wallet. No jargon. No money at risk.", body: "A full momentum desk in simulation. We never ask for a recovery phrase." },
    { id: "tw-07", angle: "quant", headline: "Build the rule set. Replay it. Then judge it.", body: "Thresholds, historical replay, near-miss frontier, audit-logged changes." },
    { id: "tw-08", angle: "quant", headline: "Momentum API + MCP tools + audit log", body: "Rate limits, correlation IDs, one-click rollback. Free tier available." },
    { id: "tw-09", angle: "objection", headline: "No black boxes. No promises.", body: "You get the reasoning; you make the call. Scores are probabilistic and can be wrong." },
    { id: "tw-10", angle: "objection", headline: "It's a research tool, not a signal group", body: "Explainable scoring plus paper trading. Nothing here is investment advice." },
    { id: "tw-11", angle: "curiosity", headline: "What almost fired today?", body: "The near-miss list shows tokens sitting just under your thresholds, and by how much." },
    { id: "tw-12", angle: "curiosity", headline: "Change one threshold. Replay a month.", body: "See how your scans would have differed — before you trust the rule." },
  ],
  tiktok: [
    { id: "tk-01", angle: "beginner", headline: "Practise crypto with fake money", body: "A full momentum desk in simulation. No card, no real orders." },
    { id: "tk-02", angle: "beginner", headline: "Crypto jargon, translated", body: "Each signal becomes one plain sentence you can actually read." },
    { id: "tk-03", angle: "beginner", headline: "Your first scan in 60 seconds", body: "Guided setup picks sensible defaults. Everything runs in paper mode." },
    { id: "tk-04", angle: "explainability", headline: "See why the score moved", body: "Rules passed, rules nearly missed. No black box." },
    { id: "tk-05", angle: "explainability", headline: "Every score comes with receipts", body: "Thresholds and margins shown on screen. Simulation only." },
    { id: "tk-06", angle: "risk-first", headline: "Zero money at risk", body: "Live trading is off and locked. Learn the process first." },
    { id: "tk-07", angle: "risk-first", headline: "Risk limits before anything else", body: "Position caps and loss caps on by default. Educational tool." },
    { id: "tk-08", angle: "objection", headline: "We never ask for a seed phrase", body: "Wallet views are read-only. Your keys stay yours." },
    { id: "tk-09", angle: "objection", headline: "Not a signal group", body: "A scoring and practice tool. Not financial advice." },
    { id: "tk-10", angle: "curiosity", headline: "What almost triggered today?", body: "The near-miss list is the interesting part. Free to look." },
    { id: "tk-11", angle: "curiosity", headline: "Replay history with your rules", body: "One tap re-runs past scans on your current settings." },
    { id: "tk-12", angle: "quant", headline: "Build your own rule set", body: "Thresholds, replays and a fragility chart. Paper mode only." },
  ],
  youtube: [
    { id: "yt-01", angle: "explainability", headline: "Momentum scores, fully explained", body: "Watch the rules, margins and replays behind one score. Paper trading only." },
    { id: "yt-02", angle: "explainability", headline: "See inside the scoring engine", body: "Thresholds and near-misses on screen. Nothing here is investment advice." },
    { id: "yt-03", angle: "risk-first", headline: "Practise on simulated capital", body: "Journal, drawdown and hard risk limits. Live execution disabled." },
    { id: "yt-04", angle: "risk-first", headline: "Risk controls, demonstrated", body: "See a blocked order and why it was rejected. Educational simulation." },
    { id: "yt-05", angle: "beginner", headline: "Crypto momentum for beginners", body: "Plain-English walkthrough, then try it yourself in paper mode. Free." },
    { id: "yt-06", angle: "beginner", headline: "Watch a first scan end to end", body: "Guided setup, one scan, one explanation. No wallet required." },
    { id: "yt-07", angle: "quant", headline: "Rule builder and replay demo", body: "Set thresholds, replay history, read the near-miss frontier." },
    { id: "yt-08", angle: "quant", headline: "API and MCP tools tour", body: "Momentum endpoint, agent tools, audit logs and rollback." },
    { id: "yt-09", angle: "objection", headline: "No black-box calls", body: "Every score shows its reasoning. Scores are probabilistic and can be wrong." },
    { id: "yt-10", angle: "objection", headline: "No seed phrase, ever", body: "Read-only wallet views and simulated trading throughout." },
    { id: "yt-11", angle: "curiosity", headline: "The near-miss view", body: "Which tokens sat just under the line, and by how much." },
    { id: "yt-12", angle: "curiosity", headline: "One threshold, one month replayed", body: "Watch how a single change reshapes past scans." },
  ],
  linkedin: [
    { id: "li-01", angle: "quant", headline: "Momentum scoring you can defend in a review", body: "Rule-based scores with visible thresholds, audit trails and exportable reports. Simulation-first, not investment advice." },
    { id: "li-02", angle: "quant", headline: "Every rule change is versioned and reversible", body: "Correlation IDs, an append-only audit log and one-click rollback on any threshold change." },
    { id: "li-03", angle: "explainability", headline: "Explainability as a product requirement", body: "Each score lists the conditions that passed, the ones that nearly failed, and the margin left on each." },
    { id: "li-04", angle: "explainability", headline: "From opaque score to documented decision", body: "Reasoning, replays and export-ready evidence for every momentum score in the system." },
    { id: "li-05", angle: "risk-first", headline: "Risk bounds that block unsafe configurations", body: "Loosening a threshold past your risk policy is rejected automatically and logged with a reason." },
    { id: "li-06", angle: "risk-first", headline: "A paper desk with real risk accounting", body: "Position limits, drawdown tracking and rejected-order history. Live execution stays disabled." },
    { id: "li-07", angle: "beginner", headline: "Onboard a team without risking capital", body: "Simulated accounts, guided setup and plain-English explanations for every signal." },
    { id: "li-08", angle: "beginner", headline: "Teach the process, not the outcome", body: "Win rate, profit factor and expectancy per strategy, tracked in a shared journal." },
    { id: "li-09", angle: "objection", headline: "Not a signal service", body: "A research and simulation platform. Scores are probabilistic estimates, not predictions of return." },
    { id: "li-10", angle: "objection", headline: "No custody, no keys, no seed phrases", body: "Wallet data is read-only and all trading is simulated by default." },
    { id: "li-11", angle: "curiosity", headline: "Where is your threshold actually fragile?", body: "The matches-versus-near-miss frontier makes the trade-off explicit before you commit to a level." },
    { id: "li-12", angle: "curiosity", headline: "What would last quarter's rules have caught?", body: "Replay any configuration over historical windows and diff the outcome." },
  ],
  display: [
    { id: "dp-01", angle: "explainability", headline: "Scores with reasoning", body: "See the rules behind every momentum score. Paper trading only." },
    { id: "dp-02", angle: "explainability", headline: "No black-box calls", body: "Thresholds and margins, shown. Not investment advice." },
    { id: "dp-03", angle: "risk-first", headline: "Simulated capital", body: "Learn momentum with risk limits on and live trading off." },
    { id: "dp-04", angle: "risk-first", headline: "Risk limits first", body: "Position caps, loss caps, blocked-order log. Educational tool." },
    { id: "dp-05", angle: "beginner", headline: "Crypto, in plain English", body: "Each signal becomes a sentence. Free plan, no card." },
    { id: "dp-06", angle: "beginner", headline: "Practise, don't gamble", body: "A full momentum desk running on simulated money." },
    { id: "dp-07", angle: "quant", headline: "Rules. Replay. Frontier.", body: "Build thresholds and test them on history before trusting them." },
    { id: "dp-08", angle: "quant", headline: "API + audit log", body: "Momentum endpoint with rate limits and rollback." },
    { id: "dp-09", angle: "objection", headline: "No seed phrase, ever", body: "Read-only wallet views. Your keys stay yours." },
    { id: "dp-10", angle: "curiosity", headline: "What almost fired?", body: "See the near-miss list for today's scan. Free to try." },
    { id: "dp-11", angle: "curiosity", headline: "Replay your rules", body: "Re-run history against your current thresholds." },
    { id: "dp-12", angle: "objection", headline: "Research, not returns", body: "Probabilistic scores for your own research. Simulation only." },
  ],
  email: [
    { id: "em-01", angle: "explainability", headline: "The reasoning behind every momentum score", body: "This week we're opening up the explain view: rules passed, rules nearly missed, and the margin left on each. Everything still runs in paper mode." },
    { id: "em-02", angle: "explainability", headline: "Why did that signal fire?", body: "You can now answer that in one click — thresholds, operators and near-miss margins are shown inline on every score." },
    { id: "em-03", angle: "risk-first", headline: "Your risk limits, visible at a glance", body: "Position caps, daily loss caps and a full log of blocked orders. Live execution stays disabled and locked while you build the process." },
    { id: "em-04", angle: "risk-first", headline: "Finish setting up your paper desk", body: "Your simulated account is waiting: journal, drawdown tracking and an equity curve. No card, no real orders, no advice." },
    { id: "em-05", angle: "beginner", headline: "Start with one scan", body: "The guided setup picks sensible defaults and explains each idea as you hit it. Three minutes and you'll have your first explained score." },
    { id: "em-06", angle: "beginner", headline: "Crypto momentum, translated", body: "Every signal now comes with a plain-English sentence, and the copilot will answer follow-up questions while you practise in simulation." },
    { id: "em-07", angle: "quant", headline: "Replay your rules over history", body: "Change a threshold, re-run past scans and diff the matches. The frontier chart shows where your configuration gets fragile." },
    { id: "em-08", angle: "quant", headline: "New: momentum API and agent tools", body: "Pull scores and near-miss breakdowns over the public API or straight into an agent via MCP, with rate limits and audit logging." },
    { id: "em-09", angle: "objection", headline: "We will never ask for your recovery phrase", body: "Wallet views are read-only and trading is simulated by default. If anything ever asks you for a phrase, it isn't us." },
    { id: "em-10", angle: "objection", headline: "What PumpPilot AI is — and isn't", body: "It's a research and simulation tool. Scores are probabilistic and can be wrong, and nothing in the product is investment advice." },
    { id: "em-11", angle: "curiosity", headline: "What almost triggered this week", body: "Your near-miss digest shows the tokens that sat just under your thresholds, and exactly how far off they were." },
    { id: "em-12", angle: "curiosity", headline: "One threshold, a month of history", body: "See how a single change would have reshaped your past scans before you commit to it." },
  ],
};

/** Phrases that must never appear in ad copy. */
export const BANNED_PHRASES = [
  "guaranteed",
  "guarantee",
  "risk-free",
  "risk free",
  "get rich",
  "profit",
  "profits",
  "returns of",
  "double your",
  "seed phrase" /* allowed only as a negation — see check below */,
  "financial advice" /* allowed only as a negation */,
  "sure thing",
  "can't lose",
  "moon",
  "100x",
];

const NEGATION_ALLOWED = ["seed phrase", "financial advice", "recovery phrase"];

export type ComplianceIssue = { variantId: string; field: "headline" | "body"; issue: string };

/** Lightweight compliance + length QA used by the copy studio UI. */
export function checkVariant(placement: PlacementSpec, v: CopyVariant): ComplianceIssue[] {
  const issues: ComplianceIssue[] = [];
  const fields: [("headline" | "body"), string, number][] = [
    ["headline", v.headline, placement.headlineMax],
    ["body", v.body, placement.bodyMax],
  ];
  for (const [field, text, max] of fields) {
    if (text.length > max) {
      issues.push({
        variantId: v.id,
        field,
        issue: `${text.length}/${max} chars — over the ${placement.label} limit`,
      });
    }
    const lower = text.toLowerCase();
    for (const phrase of BANNED_PHRASES) {
      if (!lower.includes(phrase)) continue;
      const negated =
        NEGATION_ALLOWED.includes(phrase) &&
        /(never|not|no|isn't|won't|doesn't)[^.]{0,40}/.test(
          lower.slice(Math.max(0, lower.indexOf(phrase) - 40), lower.indexOf(phrase) + phrase.length),
        );
      if (!negated) {
        issues.push({ variantId: v.id, field, issue: `Contains restricted phrase "${phrase}"` });
      }
    }
  }
  return issues;
}

/** Builds the tagged destination URL for a variant. */
export function buildVariantUrl(
  placement: PlacementSpec,
  variant: CopyVariant,
  opts: { origin?: string; landingPath?: string; campaign?: string } = {},
) {
  const origin = opts.origin ?? "https://getpumppilot.app";
  const path = opts.landingPath ?? "/";
  const params = new URLSearchParams({
    utm_source: placement.utm_source,
    utm_medium: placement.utm_medium,
    utm_campaign: opts.campaign || "copy_test",
    utm_content: variant.id,
  });
  return `${origin}${path}?${params.toString()}`;
}

export function getPlacement(id: PlacementId): PlacementSpec {
  return PLACEMENTS.find((p) => p.id === id) ?? PLACEMENTS[0];
}
