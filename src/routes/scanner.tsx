import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "@/components/app-shell";
import { DisclaimerBanner, DemoBadge } from "@/components/disclaimer";
import { ASSETS, fmtPct, fmtUsd } from "@/lib/mock-data";
import { Card, CardContent } from "@/components/ui/card";
import { MomentumBadge } from "@/components/momentum";
import { Sparkline } from "@/components/sparkline";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search } from "lucide-react";

export const Route = createFileRoute("/scanner")({
  head: () => ({
    meta: [
      { title: "Market Scanner — PumpPilot AI" },
      {
        name: "description",
        content: "Screen assets by momentum score, volume and volatility. Demo data only.",
      },
      { property: "og:title", content: "Market Scanner — PumpPilot AI" },
      {
        property: "og:description",
        content: "Screen assets by momentum score, volume and volatility.",
      },
    ],
  }),
  component: Scanner,
});

function Scanner() {
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<"all" | "major" | "demo-smallcap">("all");

  const filtered = ASSETS.filter(
    (a) =>
      (tab === "all" || a.category === tab) &&
      (q === "" ||
        a.symbol.toLowerCase().includes(q.toLowerCase()) ||
        a.name.toLowerCase().includes(q.toLowerCase())),
  ).sort((a, b) => b.momentum.total - a.momentum.total);

  return (
    <AppShell>
      <div className="space-y-5">
        <div>
          <h1 className="text-2xl font-bold sm:text-3xl">Market Scanner</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Ranked by explainable momentum score. All figures are demo data.
          </p>
        </div>

        <DisclaimerBanner />

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search symbol or name…"
              className="pl-9"
            />
          </div>
          <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
            <TabsList>
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="major">Majors</TabsTrigger>
              <TabsTrigger value="demo-smallcap">Demo small-caps</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <Card className="border-border/60 bg-card/60">
          <CardContent className="p-0">
            <div className="hidden grid-cols-[minmax(0,1.4fr)_100px_100px_100px_140px_80px] gap-2 border-b border-border/60 px-4 py-2 text-[11px] uppercase tracking-wider text-muted-foreground md:grid">
              <div>Asset</div>
              <div className="text-right">Price</div>
              <div className="text-right">24h</div>
              <div className="text-right">Volume</div>
              <div>Trend</div>
              <div className="text-right">Score</div>
            </div>
            <div className="divide-y divide-border/60">
              {filtered.map((a) => (
                <Link
                  key={a.symbol}
                  to="/asset/$symbol"
                  params={{ symbol: a.symbol }}
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 transition hover:bg-muted/40 md:grid-cols-[minmax(0,1.4fr)_100px_100px_100px_140px_80px]"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-semibold">{a.symbol}</span>
                      {a.isDemo && <DemoBadge />}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">{a.name}</div>
                  </div>
                  <div className="text-right font-mono text-sm">{fmtUsd(a.price)}</div>
                  <div
                    className={`hidden text-right font-mono text-sm md:block ${
                      a.change24h >= 0 ? "text-emerald-400" : "text-rose-400"
                    }`}
                  >
                    {fmtPct(a.change24h)}
                  </div>
                  <div className="hidden text-right font-mono text-xs text-muted-foreground md:block">
                    {fmtUsd(a.volume24h)}
                  </div>
                  <div className="hidden h-8 md:block">
                    <Sparkline data={a.sparkline} positive={a.change24h >= 0} />
                  </div>
                  <div className="text-right">
                    <MomentumBadge score={a.momentum.total} />
                  </div>
                </Link>
              ))}
              {filtered.length === 0 && (
                <div className="p-6 text-center text-sm text-muted-foreground">No matches.</div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
