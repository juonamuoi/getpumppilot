// AI Portfolio Doctor — server function that analyses a paper portfolio and
// returns explainable rebalance recommendations. All data flowing in is DEMO
// paper-trading data. All output is educational, not financial advice.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { CREDIT_COSTS } from "@/lib/credits";

const PositionSnap = z.object({
  symbol: z.string().min(1).max(12),
  qty: z.number(),
  avgCost: z.number(),
  price: z.number(),
  category: z.enum(["major", "demo-smallcap"]),
  momentum: z.number(),
  change24h: z.number(),
});

const Input = z.object({
  cash: z.number(),
  equity: z.number(),
  risk: z.object({
    maxPositionPct: z.number(),
    maxDailyLossPct: z.number(),
    stopLossPct: z.number(),
    takeProfitPct: z.number(),
  }),
  positions: z.array(PositionSnap).max(30),
  candidates: z.array(PositionSnap).max(15),
  riskProfile: z.enum(["conservative", "balanced", "aggressive"]).optional(),
});

export type DoctorInput = z.infer<typeof Input>;

export type DoctorRecommendation = {
  action: "buy" | "sell" | "trim" | "hold" | "avoid";
  symbol: string;
  suggestedQty?: number;
  suggestedNotionalUsd?: number;
  rationale: string;
  confidence: "low" | "medium" | "high";
  risk: "low" | "medium" | "high";
};

export type DoctorReport = {
  healthScore: number; // 0-100
  headline: string;
  diagnosis: string[];
  recommendations: DoctorRecommendation[];
  disclaimer: string;
};

function fallback(input: DoctorInput): DoctorReport {
  const concentration = input.positions.length
    ? Math.max(
        ...input.positions.map((p) => (p.price * p.qty) / Math.max(input.equity, 1)),
      ) * 100
    : 0;
  const cashPct = (input.cash / Math.max(input.equity, 1)) * 100;
  const diagnosis: string[] = [];
  if (concentration > input.risk.maxPositionPct)
    diagnosis.push(
      `Concentration risk: largest position is ~${concentration.toFixed(1)}% of equity (limit ${input.risk.maxPositionPct}%).`,
    );
  if (cashPct < 10) diagnosis.push("Cash reserve is thin — hard to buy dips or cover risk events.");
  if (cashPct > 60) diagnosis.push("Very high cash — under-deployed relative to your risk profile.");
  if (diagnosis.length === 0) diagnosis.push("Book is broadly within your risk limits.");

  return {
    healthScore: Math.max(0, 100 - Math.round(concentration)),
    headline: "Local fallback analysis (AI unavailable).",
    diagnosis,
    recommendations: [],
    disclaimer:
      "Demo paper-trading data. Educational only — not financial advice. Predictions are probabilistic; you can lose all capital.",
  };
}

/** Signed-in users only, and charged server-side so the AI gateway can't be used for free. */
export const analyzePortfolio = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => Input.parse(data))
  .handler(async ({ data, context }): Promise<{ ok: true; report: DoctorReport } | { ok: false; error: string; report: DoctorReport }> => {
    const { data: charge, error: chargeError } = await context.supabase.rpc("consume_credits", {
      _amount: CREDIT_COSTS.doctor_audit,
      _feature: "doctor_audit",
      _description: "Portfolio Doctor audit",
    });
    const chargeResult = (charge ?? {}) as { ok?: boolean; reason?: string; balance?: number };
    if (chargeError || !chargeResult.ok) {
      return {
        ok: false,
        error:
          chargeResult.reason === "insufficient_credits"
            ? `Out of credits — the Doctor is paused. This audit needs ${CREDIT_COSTS.doctor_audit} credits, you have ${chargeResult.balance ?? 0}. Recharge on the Pricing page.`
            : "Could not charge credits. Try again.",
        report: fallback(data),
      };
    }

    const key = process.env.LOVABLE_API_KEY;
    if (!key) {
      return { ok: false, error: "AI unavailable", report: fallback(data) };
    }

    const system =
      "You are the PumpPilot AI Portfolio Doctor for a PAPER-TRADING sandbox. All prices, positions and tokens are DEMO. " +
      "Be honest, cautious, plain-English. Never guarantee returns. Never promise gains. Never recommend real-money trades. " +
      "Reason about concentration risk, correlation, cash buffer vs risk profile, momentum quality, and stated risk limits. " +
      "Return ONLY compact JSON matching the schema — no prose outside JSON.";

    const schemaHint = `{
  "healthScore": 0-100 integer,
  "headline": "one sentence, <= 120 chars",
  "diagnosis": ["3-6 short bullet strings"],
  "recommendations": [
    {
      "action": "buy"|"sell"|"trim"|"hold"|"avoid",
      "symbol": "SYM",
      "suggestedNotionalUsd": number (optional),
      "rationale": "1-2 sentence plain-English reason",
      "confidence": "low"|"medium"|"high",
      "risk": "low"|"medium"|"high"
    }
  ]
}`;

    const user = `Risk profile: ${data.riskProfile ?? "balanced"}
Equity: $${data.equity.toFixed(2)} | Cash: $${data.cash.toFixed(2)} (${((data.cash / Math.max(data.equity, 1)) * 100).toFixed(1)}%)
Risk limits: maxPos=${data.risk.maxPositionPct}%, stop=${data.risk.stopLossPct}%, take=${data.risk.takeProfitPct}%, dailyLoss=${data.risk.maxDailyLossPct}%

Current positions (all demo prices):
${data.positions
  .map(
    (p) =>
      `  ${p.symbol} (${p.category}) qty=${p.qty} avg=$${p.avgCost} last=$${p.price} 24h=${p.change24h.toFixed(2)}% momentum=${p.momentum}`,
  )
  .join("\n") || "  (none)"}

Watchlist candidates:
${data.candidates
  .map(
    (p) =>
      `  ${p.symbol} (${p.category}) last=$${p.price} 24h=${p.change24h.toFixed(2)}% momentum=${p.momentum}`,
  )
  .join("\n") || "  (none)"}

Return JSON only matching this shape:
${schemaHint}`;

    try {
      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "Lovable-API-Key": key,
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
          response_format: { type: "json_object" },
          temperature: 0.3,
        }),
      });
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        return {
          ok: false,
          error: `AI error ${res.status}: ${t.slice(0, 140)}`,
          report: fallback(data),
        };
      }
      const json = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const raw = json.choices?.[0]?.message?.content?.trim() ?? "{}";
      const parsed = JSON.parse(raw) as Partial<DoctorReport>;
      const report: DoctorReport = {
        healthScore: Math.max(0, Math.min(100, Math.round(Number(parsed.healthScore) || 0))),
        headline: String(parsed.headline || "").slice(0, 200),
        diagnosis: Array.isArray(parsed.diagnosis)
          ? parsed.diagnosis.slice(0, 8).map((s) => String(s).slice(0, 240))
          : [],
        recommendations: Array.isArray(parsed.recommendations)
          ? parsed.recommendations.slice(0, 8).map((r) => ({
              action: (["buy", "sell", "trim", "hold", "avoid"] as const).includes(
                r.action as never,
              )
                ? (r.action as DoctorRecommendation["action"])
                : "hold",
              symbol: String(r.symbol || "").slice(0, 12),
              suggestedQty: typeof r.suggestedQty === "number" ? r.suggestedQty : undefined,
              suggestedNotionalUsd:
                typeof r.suggestedNotionalUsd === "number" ? r.suggestedNotionalUsd : undefined,
              rationale: String(r.rationale || "").slice(0, 400),
              confidence: (["low", "medium", "high"] as const).includes(
                r.confidence as never,
              )
                ? (r.confidence as DoctorRecommendation["confidence"])
                : "medium",
              risk: (["low", "medium", "high"] as const).includes(r.risk as never)
                ? (r.risk as DoctorRecommendation["risk"])
                : "medium",
            }))
          : [],
        disclaimer:
          "Demo paper-trading data. Educational only — not financial advice. Predictions are probabilistic; you can lose all capital.",
      };
      return { ok: true, report };
    } catch (e) {
      return {
        ok: false,
        error: e instanceof Error ? e.message : "Unknown error",
        report: fallback(data),
      };
    }
  });
