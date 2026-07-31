import { withSocialMeta } from "@/lib/social-meta";
import { faqSchema, ldScript } from "@/lib/structured-data";
import { FaqSection } from "@/components/faq-section";
import { scannerFaqs } from "@/lib/page-faqs";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { DisclaimerBanner, DemoBadge } from "@/components/disclaimer";
import { fmtPct, fmtUsd, type Asset } from "@/lib/mock-data";
import { useLiveAssets } from "@/lib/live-assets";
import { Card, CardContent } from "@/components/ui/card";
import { MomentumBadge, scoreColor } from "@/components/momentum";
import { Sparkline } from "@/components/sparkline";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronDown,
  Info,
  Search,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/scanner")({
  head: () => ({
    scripts: [ldScript(faqSchema(scannerFaqs, "/scanner"))],
    links: [{ rel: "canonical", href: "https://www.getpumppilot.app/scanner" }],
    meta: withSocialMeta([
      { property: "og:url", content: "https://www.getpumppilot.app/scanner" },
      { title: "Market Scanner — PumpPilot AI" },
      {
        name: "description",
        content:
          "Screen assets by explainable momentum score with sortable trend, volume, volatility, social and breakout components. Demo data.",
      },
      { property: "og:title", content: "Market Scanner — PumpPilot AI" },
      {
        property: "og:description",
        content:
          "Sortable momentum breakdown for every scanned asset with plain-English reasons.",
      },
      {
        property: "og:image:alt",
        content: "PumpPilot AI market scanner — explainable momentum scores",
      },
    ]),
  }),
  component: Scanner,
});

type SortKey =
  | "symbol"
  | "price"
  | "change24h"
  | "volume24h"
  | "trend"
  | "volume"
  | "volatility"
  | "social"
  | "breakout"
  | "total";

const COMPONENTS: { key: Exclude<SortKey, "symbol" | "price" | "change24h" | "volume24h" | "total">; label: string; hint: string }[] = [
  { key: "trend", label: "Trend", hint: "Direction & slope of price action" },
  { key: "volume", label: "Volume", hint: "Participation vs recent baseline" },
  { key: "volatility", label: "Volatility", hint: "Size of swings — higher = riskier" },
  { key: "social", label: "Social", hint: "Attention & mention velocity" },
  { key: "breakout", label: "Breakout", hint: "Distance from key resistance" },
];

function valueFor(a: Asset, k: SortKey): number | string {
  switch (k) {
    case "symbol": return a.symbol;
    case "price": return a.price;
    case "change24h": return a.change24h;
    case "volume24h": return a.volume24h;
    case "total": return a.momentum.total;
    default: return a.momentum[k];
  }
}

function SortHeader({
  label,
  k,
  sort,
  dir,
  onSort,
  className,
}: {
  label: string;
  k: SortKey;
  sort: SortKey;
  dir: "asc" | "desc";
  onSort: (k: SortKey) => void;
  className?: string;
}) {
  const active = sort === k;
  const Icon = active ? (dir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <button
      onClick={() => onSort(k)}
      className={cn(
        "flex items-center gap-1 text-[11px] uppercase tracking-wider transition hover:text-foreground",
        active ? "text-foreground" : "text-muted-foreground",
        className,
      )}
    >
      <span>{label}</span>
      <Icon className="h-3 w-3 opacity-70" />
    </button>
  );
}

function ScoreCell({ v }: { v: number }) {
  return (
    <div className="flex items-center justify-end gap-2">
      <Progress value={v} className="h-1 w-10" />
      <span className={cn("w-6 text-right font-mono text-xs", scoreColor(v))}>{v}</span>
    </div>
  );
}

function Scanner() {
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<"all" | "major" | "demo-smallcap">("all");
  const [sort, setSort] = useState<SortKey>("total");
  const [dir, setDir] = useState<"asc" | "desc">("desc");
  const [expanded, setExpanded] = useState<string | null>(null);

  const onSort = (k: SortKey) => {
    if (sort === k) setDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSort(k);
      setDir(k === "symbol" ? "asc" : "desc");
    }
  };

  const { assets: liveAssets, liveCount } = useLiveAssets();

  const filtered = useMemo(() => {
    const base = liveAssets.filter(
      (a) =>
        (tab === "all" || a.category === tab) &&
        (q === "" ||
          a.symbol.toLowerCase().includes(q.toLowerCase()) ||
          a.name.toLowerCase().includes(q.toLowerCase())),
    );
    return base.sort((a, b) => {
      const av = valueFor(a, sort);
      const bv = valueFor(b, sort);
      if (typeof av === "string" && typeof bv === "string") {
        return dir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      }
      const an = av as number;
      const bn = bv as number;
      return dir === "asc" ? an - bn : bn - an;
    });
  }, [q, tab, sort, dir, liveAssets]);

  const avgScore = filtered.length
    ? Math.round(filtered.reduce((s, a) => s + a.momentum.total, 0) / filtered.length)
    : 0;
  const topScore = filtered.length ? Math.max(...filtered.map((a) => a.momentum.total)) : 0;
  const risers = filtered.filter((a) => a.change24h > 0).length;

  return (
    <AppShell>
      <div className="space-y-5">
        <div>
          <h1 className="text-2xl font-bold sm:text-3xl">Market Scanner</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Ranked by explainable momentum score. Tap any row to see the reasoning.
          </p>
        </div>

        <DisclaimerBanner />

        {/* Summary stats */}
        <h2 className="text-lg font-semibold">Market Overview</h2>
        <div className="grid grid-cols-3 gap-2 sm:gap-3">

          {[
            { label: "Scanned", value: filtered.length.toString() },
            { label: "Avg score", value: avgScore.toString(), color: scoreColor(avgScore) },
            { label: "Top score", value: topScore.toString(), color: scoreColor(topScore) },
          ].map((s) => (
            <div key={s.label} className="rounded-xl border border-border/60 bg-card/60 p-3">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                {s.label}
              </div>
              <div className={cn("mt-1 font-mono text-xl font-bold", s.color)}>{s.value}</div>
            </div>
          ))}
        </div>
        <div className="text-[11px] text-muted-foreground">
          {risers} of {filtered.length} up on the day. {liveCount} priced with live CoinGecko data;
          fictional demo tokens remain simulated.
        </div>

        <h2 className="text-lg font-semibold">Asset Scanner</h2>

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
            {/* Desktop header row with sortable columns */}
            <div className="hidden items-center gap-3 border-b border-border/60 px-4 py-2 lg:grid lg:grid-cols-[minmax(0,1.4fr)_90px_80px_100px_repeat(5,64px)_90px_28px]">
              <SortHeader label="Asset" k="symbol" sort={sort} dir={dir} onSort={onSort} />
              <SortHeader label="Price" k="price" sort={sort} dir={dir} onSort={onSort} className="justify-end" />
              <SortHeader label="24h" k="change24h" sort={sort} dir={dir} onSort={onSort} className="justify-end" />
              <SortHeader label="Volume" k="volume24h" sort={sort} dir={dir} onSort={onSort} className="justify-end" />
              {COMPONENTS.map((c) => (
                <SortHeader
                  key={c.key}
                  label={c.label}
                  k={c.key}
                  sort={sort}
                  dir={dir}
                  onSort={onSort}
                  className="justify-end"
                />
              ))}
              <SortHeader label="Score" k="total" sort={sort} dir={dir} onSort={onSort} className="justify-end" />
              <span />
            </div>

            {/* Mobile sort control */}
            <div className="flex items-center gap-2 border-b border-border/60 p-3 lg:hidden">
              <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Sort</span>
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as SortKey)}
                className="rounded-md border border-border/60 bg-background px-2 py-1 text-xs"
              >
                <option value="total">Score</option>
                <option value="change24h">24h change</option>
                <option value="volume24h">Volume</option>
                <option value="trend">Trend</option>
                <option value="volume">Volume score</option>
                <option value="volatility">Volatility</option>
                <option value="social">Social</option>
                <option value="breakout">Breakout</option>
                <option value="price">Price</option>
                <option value="symbol">Symbol</option>
              </select>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setDir((d) => (d === "asc" ? "desc" : "asc"))}
                className="h-7 px-2"
              >
                {dir === "asc" ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />}
              </Button>
            </div>

            <div className="divide-y divide-border/60">
              {filtered.map((a) => {
                const isOpen = expanded === a.symbol;
                return (
                  <div key={a.symbol}>
                    <button
                      onClick={() => setExpanded(isOpen ? null : a.symbol)}
                      className="grid w-full grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 px-4 py-3 text-left transition hover:bg-muted/40 lg:grid-cols-[minmax(0,1.4fr)_90px_80px_100px_repeat(5,64px)_90px_28px]"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="truncate font-semibold">{a.symbol}</span>
                          {a.isDemo && <DemoBadge />}
                        </div>
                        <div className="truncate text-xs text-muted-foreground">{a.name}</div>
                      </div>
                      <div className="text-right font-mono text-sm lg:block">{fmtUsd(a.price)}</div>
                      <div
                        className={cn(
                          "hidden text-right font-mono text-sm lg:block",
                          a.change24h >= 0 ? "text-emerald-400" : "text-rose-400",
                        )}
                      >
                        {fmtPct(a.change24h)}
                      </div>
                      <div className="hidden text-right font-mono text-xs text-muted-foreground lg:block">
                        {fmtUsd(a.volume24h)}
                      </div>
                      {COMPONENTS.map((c) => (
                        <div key={c.key} className="hidden lg:block">
                          <ScoreCell v={a.momentum[c.key]} />
                        </div>
                      ))}
                      <div className="hidden lg:flex lg:justify-end">
                        <MomentumBadge score={a.momentum.total} />
                      </div>
                      <div className="flex items-center gap-2 lg:justify-end">
                        <span className="lg:hidden">
                          <MomentumBadge score={a.momentum.total} />
                        </span>
                        <ChevronDown
                          className={cn(
                            "h-4 w-4 text-muted-foreground transition-transform",
                            isOpen && "rotate-180",
                          )}
                        />
                      </div>
                    </button>

                    {isOpen && (
                      <div className="border-t border-border/40 bg-muted/20 px-4 py-4">
                        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_260px]">
                          <div className="space-y-3">
                            <div className="flex items-start gap-2 rounded-lg border border-border/60 bg-background/40 p-3">
                              <Info className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                              <div>
                                <div className="text-xs font-semibold text-foreground">
                                  Why this score
                                </div>
                                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                                  {a.momentum.reason}
                                </p>
                              </div>
                            </div>
                            <div className="grid grid-cols-2 gap-2 lg:hidden">
                              {COMPONENTS.map((c) => (
                                <div
                                  key={c.key}
                                  className="rounded-lg border border-border/60 bg-background/40 p-2"
                                >
                                  <div className="flex items-center justify-between text-[11px]">
                                    <span className="text-muted-foreground">{c.label}</span>
                                    <span className={cn("font-mono", scoreColor(a.momentum[c.key]))}>
                                      {a.momentum[c.key]}
                                    </span>
                                  </div>
                                  <Progress value={a.momentum[c.key]} className="mt-1 h-1" />
                                </div>
                              ))}
                            </div>
                            <div className="hidden space-y-2 lg:block">
                              {COMPONENTS.map((c) => (
                                <div key={c.key} className="flex items-center gap-3">
                                  <div className="w-20 text-xs text-muted-foreground">{c.label}</div>
                                  <Progress value={a.momentum[c.key]} className="h-1.5 flex-1" />
                                  <div className={cn("w-8 text-right font-mono text-xs", scoreColor(a.momentum[c.key]))}>
                                    {a.momentum[c.key]}
                                  </div>
                                  <div className="hidden w-56 text-[11px] text-muted-foreground xl:block">
                                    {c.hint}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                          <div className="space-y-3">
                            <div className="h-20 rounded-lg border border-border/60 bg-background/40 p-2">
                              <Sparkline data={a.sparkline} positive={a.change24h >= 0} />
                            </div>
                            <Link
                              to="/asset/$symbol"
                              params={{ symbol: a.symbol }}
                              className="block rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-center text-xs font-semibold text-emerald-300 transition hover:bg-emerald-500/20"
                            >
                              Open asset details →
                            </Link>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
              {filtered.length === 0 && (
                <div className="p-6 text-center text-sm text-muted-foreground">No matches.</div>
              )}
            </div>
          </CardContent>
        </Card>
        <FaqSection faqs={scannerFaqs} title="Market scanner FAQ" />
      </div>
    </AppShell>
  );
}
