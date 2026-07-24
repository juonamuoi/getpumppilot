// Public JSON API — read-only momentum snapshot.
// CORS-open so third parties can embed / cite.
import { createFileRoute } from "@tanstack/react-router";
import { ASSETS } from "@/lib/mock-data";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "public, max-age=60, s-maxage=60",
};

export const Route = createFileRoute("/api/public/momentum")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const symbol = url.searchParams.get("symbol")?.toUpperCase();
        const limit = Math.min(
          Math.max(parseInt(url.searchParams.get("limit") ?? "10", 10) || 10, 1),
          25,
        );

        const rows = ASSETS.map((a) => ({
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
        }));

        const filtered = symbol ? rows.filter((r) => r.symbol === symbol) : rows;
        const sorted = [...filtered].sort((a, b) => b.momentum - a.momentum).slice(0, limit);

        return Response.json(
          {
            source: "PumpPilot AI",
            attribution: "https://getpumppilot.app",
            disclaimer:
              "Educational data. Momentum scores are probabilistic signals — not investment advice.",
            generatedAt: new Date().toISOString(),
            count: sorted.length,
            data: sorted,
          },
          { headers: CORS },
        );
      },
    },
  },
});
