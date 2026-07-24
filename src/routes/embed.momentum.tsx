// Embeddable widget — designed to be dropped in an <iframe> on any site.
// Renders a compact top-momentum list with a "Powered by PumpPilot AI" backlink.
import { createFileRoute } from "@tanstack/react-router";
import { ASSETS, fmtPct, fmtUsd } from "@/lib/mock-data";
import { scoreColor } from "@/components/momentum";

type Search = { symbol?: string; limit?: number; theme?: "dark" | "light" };

export const Route = createFileRoute("/embed/momentum")({
  head: () => ({
    meta: [
      { title: "PumpPilot AI — Momentum Widget" },
      { name: "robots", content: "noindex" },
    ],
  }),
  validateSearch: (s: Record<string, unknown>): Search => ({
    symbol: typeof s.symbol === "string" ? s.symbol.toUpperCase() : undefined,
    limit:
      typeof s.limit === "string" || typeof s.limit === "number"
        ? Math.min(Math.max(Number(s.limit) || 5, 1), 10)
        : 5,
    theme: s.theme === "light" ? "light" : "dark",
  }),
  component: EmbedWidget,
});

function EmbedWidget() {
  const { symbol, limit = 5, theme = "dark" } = Route.useSearch();

  const rows = [...ASSETS]
    .filter((a) => (symbol ? a.symbol === symbol : true))
    .sort((a, b) => b.momentum.total - a.momentum.total)
    .slice(0, limit);

  const isDark = theme === "dark";
  const bg = isDark ? "#0a0a0b" : "#ffffff";
  const fg = isDark ? "#e5e7eb" : "#111827";
  const sub = isDark ? "#71717a" : "#6b7280";
  const border = isDark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)";

  return (
    <div
      style={{ background: bg, color: fg, fontFamily: "system-ui, sans-serif" }}
      className="min-h-screen p-3"
    >
      <div
        className="rounded-xl p-3"
        style={{ border: `1px solid ${border}` }}
      >
        <div className="mb-2 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 font-semibold">
            <img src="/favicon.png" alt="" width={18} height={18} className="rounded" />
            <span>Top momentum</span>
          </div>
          <span style={{ color: sub }}>Updated live · demo data</span>
        </div>
        <div className="space-y-1.5">
          {rows.map((a) => (
            <div
              key={a.symbol}
              className="flex items-center justify-between rounded-lg px-2 py-1.5 text-xs"
              style={{ background: isDark ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)" }}
            >
              <div className="flex items-center gap-2">
                <span className="font-semibold">{a.symbol}</span>
                <span style={{ color: sub }}>{a.name}</span>
              </div>
              <div className="flex items-center gap-3 font-mono">
                <span>{fmtUsd(a.price)}</span>
                <span style={{ color: a.change24h >= 0 ? "#34d399" : "#fb7185" }}>
                  {fmtPct(a.change24h)}
                </span>
                <span className={scoreColor(a.momentum.total)}>{a.momentum.total}</span>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-2 flex items-center justify-between text-[10px]" style={{ color: sub }}>
          <span>Not financial advice.</span>
          <a
            href="https://getpumppilot.app?utm_source=embed&utm_medium=widget"
            target="_blank"
            rel="noopener"
            style={{ color: "#34d399", textDecoration: "none" }}
          >
            Powered by PumpPilot AI ↗
          </a>
        </div>
      </div>
    </div>
  );
}
