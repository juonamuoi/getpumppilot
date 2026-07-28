import { defineAuditedTool } from "../audit";
import { z } from "zod";
import { ASSETS } from "@/lib/mock-data";

/** Scanner threshold presets, mirroring the in-app rule tuning presets. */
const PRESETS = {
  conservative: { minMomentum: 82, minVolumeScore: 70, maxVolatility: 70, min24hChangePct: 5 },
  balanced: { minMomentum: 75, minVolumeScore: 60, maxVolatility: 85, min24hChangePct: 3 },
  aggressive: { minMomentum: 65, minVolumeScore: 50, maxVolatility: 95, min24hChangePct: 1 },
} as const;

type PresetName = keyof typeof PRESETS;

/** A near miss is a rule failed by no more than this margin (in rule units). */
const NEAR_MISS_MARGIN = 8;

export default defineAuditedTool({
  name: "momentum_explain",
  title: "Explain momentum & near-miss risk",
  description:
    "Return the full explainable momentum reasoning for one token (component scores, plain-English drivers) plus a per-rule pass/fail and near-miss risk breakdown against a scanner threshold preset (conservative, balanced, aggressive) or custom thresholds. Educational data only — not investment advice.",
  inputSchema: {
    symbol: z.string().describe("Ticker of the token to explain, e.g. BTC or DEMO1."),
    preset: z
      .enum(["conservative", "balanced", "aggressive"])
      .optional()
      .describe("Threshold preset to evaluate against. Defaults to balanced."),
    thresholds: z
      .object({
        minMomentum: z.number().min(0).max(100).optional(),
        minVolumeScore: z.number().min(0).max(100).optional(),
        maxVolatility: z.number().min(0).max(100).optional(),
        min24hChangePct: z.number().optional(),
      })
      .optional()
      .describe("Optional overrides applied on top of the preset."),
  },
  allowAnonymous: true,
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: ({ symbol, preset, thresholds }) => {
    const wanted = symbol.trim().toUpperCase();
    const asset = ASSETS.find((a) => a.symbol === wanted);

    if (!asset) {
      const payload = {
        error: `Unknown symbol "${wanted}".`,
        availableSymbols: ASSETS.map((a) => a.symbol),
      };
      return {
        content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
        structuredContent: payload,
        isError: true,
      };
    }

    const presetName: PresetName = preset ?? "balanced";
    const t = { ...PRESETS[presetName], ...(thresholds ?? {}) };
    const m = asset.momentum;

    const rules = [
      {
        rule: "minMomentum",
        label: "Momentum score",
        operator: ">=" as const,
        threshold: t.minMomentum,
        actual: m.total,
        slack: m.total - t.minMomentum,
      },
      {
        rule: "minVolumeScore",
        label: "Volume score",
        operator: ">=" as const,
        threshold: t.minVolumeScore,
        actual: m.volume,
        slack: m.volume - t.minVolumeScore,
      },
      {
        rule: "maxVolatility",
        label: "Volatility ceiling",
        operator: "<=" as const,
        threshold: t.maxVolatility,
        actual: m.volatility,
        slack: t.maxVolatility - m.volatility,
      },
      {
        rule: "min24hChangePct",
        label: "24h change %",
        operator: ">=" as const,
        threshold: t.min24hChangePct,
        actual: asset.change24h,
        slack: asset.change24h - t.min24hChangePct,
      },
    ].map((r) => ({
      ...r,
      passes: r.slack >= 0,
      nearMiss: r.slack < 0 && Math.abs(r.slack) <= NEAR_MISS_MARGIN,
      /** How much the threshold must move to flip this rule to a pass. */
      thresholdMoveToPass: r.slack >= 0 ? 0 : Number(Math.abs(r.slack).toFixed(2)),
    }));

    const failing = rules.filter((r) => !r.passes);
    const nearMisses = failing.filter((r) => r.nearMiss);
    const bindingConstraint = rules.reduce((min, r) => (r.slack < min.slack ? r : min), rules[0]);
    const matches = failing.length === 0;

    // Fragility: how close a passing signal sits to its tightest rule boundary.
    const fragility = matches
      ? Math.max(0, Math.round((1 - Math.min(bindingConstraint.slack, NEAR_MISS_MARGIN) / NEAR_MISS_MARGIN) * 100))
      : 100;

    const drivers = [
      { component: "trend", score: m.trend },
      { component: "volume", score: m.volume },
      { component: "volatility", score: m.volatility },
      { component: "social", score: m.social },
      { component: "breakout", score: m.breakout },
    ].sort((a, b) => b.score - a.score);

    const summary = matches
      ? `${asset.symbol} matches the ${presetName} preset. Tightest constraint: ${bindingConstraint.label} with ${bindingConstraint.slack.toFixed(2)} slack (fragility ${fragility}/100).`
      : `${asset.symbol} does not match the ${presetName} preset. Failing ${failing.length} rule(s)${
          nearMisses.length
            ? `, ${nearMisses.length} of them near misses: ${nearMisses
                .map((r) => `${r.label} short by ${r.thresholdMoveToPass}`)
                .join(", ")}`
            : ""
        }.`;

    const payload = {
      symbol: asset.symbol,
      name: asset.name,
      isDemo: asset.isDemo,
      isMockData: true,
      preset: presetName,
      thresholds: t,
      price: asset.price,
      change24h: asset.change24h,
      momentum: {
        total: m.total,
        trend: m.trend,
        volume: m.volume,
        volatility: m.volatility,
        social: m.social,
        breakout: m.breakout,
      },
      reason: m.reason,
      topDrivers: drivers.slice(0, 3),
      weakestDrivers: drivers.slice(-2),
      matches,
      rules,
      nearMissRisk: {
        marginUnits: NEAR_MISS_MARGIN,
        nearMissCount: nearMisses.length,
        nearMissRules: nearMisses.map((r) => r.rule),
        bindingConstraint: bindingConstraint.rule,
        bindingSlack: Number(bindingConstraint.slack.toFixed(2)),
        fragility,
      },
      summary,
      disclaimer:
        "Mock/demo market data. Momentum scores are probabilistic signals for education only. Returns are not guaranteed and you can lose all capital.",
    };

    return {
      content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
      structuredContent: payload,
    };
  },
});
