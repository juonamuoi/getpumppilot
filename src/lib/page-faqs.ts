/**
 * FAQ copy used for both the visible on-page accordion and the FAQPage
 * structured data. Google requires the markup to mirror visible content,
 * so these arrays are the single source of truth for both.
 */
export type Faq = { q: string; a: string };

export const alertsFaqs: Faq[] = [
  {
    q: "How do momentum alert rules work in PumpPilot AI?",
    a: "You set thresholds for momentum score, volume score and volatility. Whenever a demo asset in the scanner satisfies every enabled threshold, an alert is generated and written to the delivery history log.",
  },
  {
    q: "Can I test a rule change before saving it?",
    a: "Yes. The Replay tab re-runs a selected history window against your current rules and shows expected matches, near-misses and which threshold is the binding constraint, plus a post-save impact preview.",
  },
  {
    q: "Where can I see whether an alert was delivered?",
    a: "The History tab lists every alert with channel, timestamp and delivery status, including retries. You can search, filter by date range and channel, and export the results.",
  },
  {
    q: "Are PumpPilot AI alerts financial advice?",
    a: "No. All alerts run on clearly labelled demo data, predictions are probabilistic, returns are never guaranteed and you can lose all capital. Alerts are informational only.",
  },
];

export function assetFaqs(symbol: string, name: string): Faq[] {
  const s = symbol.toUpperCase();
  return [
    {
      q: `What does the ${s} momentum score mean?`,
      a: `The ${name} (${s}) momentum score blends trend, volume and volatility factors into a 0-100 reading. The breakdown on this page shows each factor's contribution so the score is explainable rather than a black box.`,
    },
    {
      q: `Is the ${s} price data on this page real?`,
      a: "No. PumpPilot AI uses clearly labelled mock and demo market data for every asset so you can learn the workflow without risking capital.",
    },
    {
      q: `Can I trade ${s} from this page?`,
      a: `You can open a paper (simulated) ${s} position using the trade panel. Live execution stays a disabled adapter with the master switch off and locked, and PumpPilot AI never asks for a seed phrase or private key.`,
    },
    {
      q: `Can I get alerted when ${s} momentum changes?`,
      a: `Yes. Add a per-asset trigger on the Alerts page and ${s} will be evaluated against your scanner thresholds on every scan.`,
    },
  ];
}

export const pricingFaqs: Faq[] = [
  {
    q: "Does PumpPilot AI charge a monthly subscription?",
    a: "No. PumpPilot AI is pay-as-you-go: you buy a credit pack once and spend credits on momentum predictions, Copilot answers, backtests, Portfolio Doctor audits and paper-bot orders. There is no auto-renewal.",
  },
  {
    q: "What happens when my credits run out?",
    a: "The bot immediately stops generating predictions and stops executing orders. Your alerts, history and exports stay accessible, and everything resumes as soon as you top up.",
  },
  {
    q: "Do PumpPilot AI credits expire?",
    a: "No. Credits never expire and are not billed again. You only pay when you choose to buy another pack.",
  },
  {
    q: "How much does one prediction cost?",
    a: "Each action has a fixed credit cost shown on the pricing page, so you can estimate spend before running anything. Larger packs lower the effective cost per credit.",
  },
];

export const scannerFaqs: Faq[] = [
  {
    q: "How does the PumpPilot AI market scanner rank assets?",
    a: "Every scanned asset gets a 0-100 momentum score blended from trend, volume, volatility, social and breakout components. Each component is shown separately and is sortable, so the ranking is explainable rather than a black box.",
  },
  {
    q: "Is the scanner data live market data?",
    a: "No. The scanner runs on clearly labelled demo and mock market data so you can learn the workflow without risking capital.",
  },
  {
    q: "Can I turn a scanner result into an alert?",
    a: "Yes. Open the asset from the scanner and add a per-asset trigger, or set global thresholds on the Alerts page so every scan is evaluated against your rules.",
  },
  {
    q: "Are high momentum scores a buy signal?",
    a: "No. A high score describes recent behaviour, not a recommendation. Momentum fades quickly, predictions are probabilistic and you can lose all capital — nothing in PumpPilot AI is financial advice.",
  },
];

export const learnFaqs: Faq[] = [
  {
    q: "What is momentum trading?",
    a: "Momentum trading buys assets that are already trending up and exits when the move fades, instead of trying to pick bottoms. It works best in trending markets and performs poorly in sideways chop.",
  },
  {
    q: "Do I need trading experience to use PumpPilot AI?",
    a: "No. Easy Mode, the onboarding wizard and the Learn hub explain each signal in plain English, and everything starts in paper trading so mistakes cost nothing.",
  },
  {
    q: "How should I size a position and set a stop-loss?",
    a: "The risk controls widget suggests a position size from your account risk percentage and a stop-loss distance based on the asset's volatility, so a single losing trade stays within your defined risk budget.",
  },
  {
    q: "Is the Learn hub free?",
    a: "Yes. All lessons and the glossary are free to read and do not consume credits.",
  },
];

export const paperFaqs: Faq[] = [
  {
    q: "What is paper trading in PumpPilot AI?",
    a: "Paper trading simulates orders against demo market data using a virtual balance. Positions, P&L and journal entries behave like the real workflow, but no real money and no exchange account are involved.",
  },
  {
    q: "Can PumpPilot AI execute real trades?",
    a: "No. Live execution is a disabled adapter behind a locked master switch, and PumpPilot AI never asks for a seed phrase or private key.",
  },
  {
    q: "How do I reset my paper portfolio?",
    a: "Use the reset control on the paper trading page to restore the starting virtual balance and clear open simulated positions. Your journal history is kept for review.",
  },
  {
    q: "Do paper results predict real returns?",
    a: "No. Simulated fills ignore slippage, fees and liquidity limits, so paper performance is an educational estimate only and never a guarantee of real returns.",
  },
];

export const strategyFaqs: Faq[] = [
  {
    q: "How do I build a strategy in PumpPilot AI?",
    a: "Pick entry thresholds for momentum, volume and volatility, set exit rules and risk limits, then save the strategy. The builder previews how many demo assets would match before you commit.",
  },
  {
    q: "Can I backtest a strategy before using it?",
    a: "Yes. Run the strategy through the backtest page to see win rate, drawdown and equity curve on historical demo data, then tune thresholds and re-run.",
  },
  {
    q: "What risk controls can I attach to a strategy?",
    a: "You can cap position size, set a stop-loss and take-profit distance, limit concurrent positions and set a daily loss limit that pauses the paper bot.",
  },
  {
    q: "Will a backtested strategy work live?",
    a: "Not necessarily. Backtests run on clearly labelled demo data and cannot capture slippage, fees or regime changes. Results are educational and are not financial advice.",
  },
];
