import { defineAuditedTool } from "../audit";
import { z } from "zod";
import { ASSETS } from "@/lib/mock-data";

export default defineAuditedTool({
  name: "momentum_scan",
  title: "Momentum scan",
  description:
    "Scan PumpPilot AI's tracked assets and return explainable momentum scores (trend, volume, volatility, social, breakout) with a plain-English reason. Educational data only — not investment advice.",
  inputSchema: {
    symbol: z.string().optional().describe("Optional ticker filter, e.g. BTC."),
    limit: z.number().int().optional().describe("Max rows to return (1-25, default 10)."),
  },
  allowAnonymous: true,
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: ({ symbol, limit }) => {
    const max = Math.min(Math.max(limit ?? 10, 1), 25);
    const wanted = symbol?.toUpperCase();

    const rows = ASSETS.filter((a) => !wanted || a.symbol === wanted)
      .map((a) => ({
        symbol: a.symbol,
        name: a.name,
        price: a.price,
        change24h: a.change24h,
        momentum: a.momentum.total,
        breakdown: {
          trend: a.momentum.trend,
          volume: a.momentum.volume,
          volatility: a.momentum.volatility,
          social: a.momentum.social,
          breakout: a.momentum.breakout,
        },
        reason: a.momentum.reason,
        isDemo: a.isDemo,
      }))
      .sort((a, b) => b.momentum - a.momentum)
      .slice(0, max);

    const payload = {
      count: rows.length,
      disclaimer:
        "Momentum scores are probabilistic signals for education. Returns are not guaranteed and you can lose all capital.",
      data: rows,
    };

    return {
      content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
      structuredContent: payload,
    };
  },
});
