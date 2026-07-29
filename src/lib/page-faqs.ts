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
