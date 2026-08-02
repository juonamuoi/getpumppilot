import { withSocialMeta } from "@/lib/social-meta";
import { faqSchema, ldScript } from "@/lib/structured-data";
import { FaqSection } from "@/components/faq-section";
import { scannerFaqs } from "@/lib/page-faqs";
import { markQuestAction } from "@/lib/quest-progress";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  Keyboard,
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
      type="button"
      onClick={() => onSort(k)}
      aria-label={
        active
          ? `${label} — sorted ${dir === "asc" ? "ascending" : "descending"}. Activate to reverse.`
          : `Sort by ${label}`
      }
      className={cn(
        "flex items-center gap-1 rounded-sm text-[11px] uppercase tracking-wider transition hover:text-foreground",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        active ? "text-foreground" : "text-muted-foreground",
        className,
      )}
    >
      <span>{label}</span>
      <Icon className="h-3 w-3 opacity-70" aria-hidden="true" />
    </button>
  );
}

const SHORTCUTS: { keys: string; action: string }[] = [
  { keys: "/", action: "Focus the search box" },
  { keys: "Esc", action: "Clear search / collapse the open row" },
  { keys: "↓ / j", action: "Move to the next result" },
  { keys: "↑ / k", action: "Move to the previous result" },
  { keys: "Home / End", action: "Jump to first or last result" },
  { keys: "Enter / Space", action: "Expand or collapse the focused result" },
  { keys: "o", action: "Open asset details for the focused result" },
  { keys: "f", action: "Cycle the category filter" },
  { keys: "r", action: "Reverse the sort direction" },
  { keys: "?", action: "Show or hide this shortcut list" },
];

function ScoreCell({ v }: { v: number }) {
  return (
    <div className="flex items-center justify-end gap-2">
      <Progress aria-label="Momentum score" value={v} className="h-1 w-10" />
      <span className={cn("w-6 text-right font-mono text-xs", scoreColor(v))}>{v}</span>
    </div>
  );
}


function Scanner() {
  useEffect(() => {
    markQuestAction("first_scan");
  }, []);
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<"all" | "major" | "demo-smallcap">("all");
  const [sort, setSort] = useState<SortKey>("total");
  const [dir, setDir] = useState<"asc" | "desc">("desc");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();


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

  const rowButtons = useCallback(
    () =>
      Array.from(
        listRef.current?.querySelectorAll<HTMLButtonElement>("[data-scanner-row]") ?? [],
      ),
    [],
  );

  const focusRow = useCallback(
    (index: number) => {
      const rows = rowButtons();
      if (!rows.length) return;
      const next = Math.max(0, Math.min(rows.length - 1, index));
      rows[next]?.focus();
    },
    [rowButtons],
  );

  const moveFocus = useCallback(
    (delta: number) => {
      const rows = rowButtons();
      if (!rows.length) return;
      const current = rows.findIndex((el) => el === document.activeElement);
      focusRow(current === -1 ? (delta > 0 ? 0 : rows.length - 1) : current + delta);
    },
    [rowButtons, focusRow],
  );

  const focusedSymbol = useCallback(() => {
    const el = document.activeElement as HTMLElement | null;
    return el?.getAttribute?.("data-scanner-row") ?? null;
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing =
        !!target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable);

      if (e.key === "Escape") {
        if (showShortcuts) {
          setShowShortcuts(false);
          return;
        }
        if (typing && target instanceof HTMLInputElement && target === searchRef.current) {
          if (q) {
            setQ("");
            setAnnouncement("Search cleared.");
          } else {
            target.blur();
          }
          return;
        }
        if (expanded) {
          setExpanded(null);
          setAnnouncement("Row collapsed.");
        }
        return;
      }

      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key === "/" && !typing) {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
        return;
      }
      if (e.key === "?" && !typing) {
        e.preventDefault();
        setShowShortcuts((v) => !v);
        return;
      }
      if (typing) return;

      switch (e.key) {
        case "ArrowDown":
        case "j":
          e.preventDefault();
          moveFocus(1);
          break;
        case "ArrowUp":
        case "k":
          e.preventDefault();
          moveFocus(-1);
          break;
        case "Home":
          e.preventDefault();
          focusRow(0);
          break;
        case "End":
          e.preventDefault();
          focusRow(rowButtons().length - 1);
          break;
        case "o": {
          const symbol = focusedSymbol();
          if (symbol) {
            e.preventDefault();
            navigate({ to: "/asset/$symbol", params: { symbol } });
          }
          break;
        }
        case "f": {
          e.preventDefault();
          const order = ["all", "major", "demo-smallcap"] as const;
          const next = order[(order.indexOf(tab) + 1) % order.length];
          setTab(next);
          setAnnouncement(`Filter: ${next === "demo-smallcap" ? "Demo small-caps" : next === "major" ? "Majors" : "All"}.`);
          break;
        }
        case "r": {
          e.preventDefault();
          setDir((d) => {
            const next = d === "asc" ? "desc" : "asc";
            setAnnouncement(`Sorted ${next === "asc" ? "ascending" : "descending"}.`);
            return next;
          });
          break;
        }
        default:
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [expanded, focusRow, focusedSymbol, moveFocus, navigate, q, rowButtons, showShortcuts, tab]);


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

        <div aria-live="polite" className="sr-only">
          {announcement}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setShowShortcuts((v) => !v)}
            aria-expanded={showShortcuts}
            aria-controls="scanner-shortcuts"
            className="h-8 gap-1.5 text-xs focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <Keyboard className="h-3.5 w-3.5" aria-hidden="true" />
            Keyboard shortcuts
          </Button>
          <p className="text-[11px] text-muted-foreground">
            Press <kbd className="rounded border border-border/60 bg-muted/40 px-1 font-mono">/</kbd> to
            search, <kbd className="rounded border border-border/60 bg-muted/40 px-1 font-mono">↑</kbd>{" "}
            <kbd className="rounded border border-border/60 bg-muted/40 px-1 font-mono">↓</kbd> to move
            through results, <kbd className="rounded border border-border/60 bg-muted/40 px-1 font-mono">?</kbd>{" "}
            for all shortcuts.
          </p>
        </div>

        {showShortcuts && (
          <div
            id="scanner-shortcuts"
            className="rounded-xl border border-border/60 bg-card/60 p-3"
          >
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Scanner keyboard shortcuts
            </h3>
            <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
              {SHORTCUTS.map((s) => (
                <li key={s.keys} className="flex items-center gap-2 text-xs">
                  <kbd className="min-w-14 rounded border border-border/60 bg-muted/40 px-1.5 py-0.5 text-center font-mono text-[11px]">
                    {s.keys}
                  </kbd>
                  <span className="text-muted-foreground">{s.action}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">

          <div className="relative w-full sm:max-w-xs">
            <label htmlFor="scanner-search" className="sr-only">
              Search assets by symbol or name
            </label>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              id="scanner-search"
              ref={searchRef}
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search symbol or name…  ( / )"
              aria-describedby="scanner-search-hint"
              className="pl-9 focus-visible:ring-2 focus-visible:ring-emerald-400"
            />
            <span id="scanner-search-hint" className="sr-only">
              Press slash to focus this field, Escape to clear it. {filtered.length} results match.
            </span>
          </div>
          <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
            <TabsList aria-label="Filter assets by category">
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="major">Majors</TabsTrigger>
              <TabsTrigger value="demo-smallcap">Demo small-caps</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>


        <Card className="border-border/60 bg-card/60">
          <CardContent className="p-0">
            {/* Desktop header row with sortable columns */}
            <div
              role="group"
              aria-label="Sort results"
              className="hidden items-center gap-3 border-b border-border/60 px-4 py-2 lg:grid lg:grid-cols-[minmax(0,1.4fr)_90px_80px_100px_repeat(5,64px)_90px_28px]"
            >
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
              <label
                htmlFor="scanner-sort"
                className="text-[11px] uppercase tracking-wider text-muted-foreground"
              >
                Sort
              </label>
              <select
                id="scanner-sort"
                value={sort}
                onChange={(e) => setSort(e.target.value as SortKey)}
                className="rounded-md border border-border/60 bg-background px-2 py-1 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
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
                aria-label={`Sort direction: ${dir === "asc" ? "ascending" : "descending"}. Activate to reverse.`}
                className="h-7 px-2 focus-visible:ring-2 focus-visible:ring-emerald-400"
              >
                {dir === "asc" ? (
                  <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
                ) : (
                  <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
                )}
              </Button>
            </div>

            <div ref={listRef} className="divide-y divide-border/60">

              {filtered.map((a) => {
                const isOpen = expanded === a.symbol;
                return (
                  <div key={a.symbol}>
                    <button
                      type="button"
                      data-scanner-row={a.symbol}
                      aria-expanded={isOpen}
                      aria-controls={`scanner-detail-${a.symbol}`}
                      aria-label={`${a.symbol}, ${a.name}. Momentum score ${a.momentum.total}. ${fmtPct(a.change24h)} in 24 hours. ${isOpen ? "Expanded" : "Collapsed"} — press Enter to toggle, o to open details.`}
                      onClick={() => {
                        setExpanded(isOpen ? null : a.symbol);
                        setAnnouncement(
                          isOpen ? `${a.symbol} collapsed.` : `${a.symbol} expanded. ${a.momentum.reason}`,
                        );
                      }}
                      className="grid w-full grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 px-4 py-3 text-left transition hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-400 focus-visible:bg-muted/40 lg:grid-cols-[minmax(0,1.4fr)_90px_80px_100px_repeat(5,64px)_90px_28px]"
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
                      <div
                        id={`scanner-detail-${a.symbol}`}
                        role="region"
                        aria-label={`${a.symbol} momentum breakdown`}
                        className="border-t border-border/40 bg-muted/20 px-4 py-4"
                      >
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
                                  <Progress aria-label={`${c.label} score`} value={a.momentum[c.key]} className="mt-1 h-1" />
                                </div>
                              ))}
                            </div>
                            <div className="hidden space-y-2 lg:block">
                              {COMPONENTS.map((c) => (
                                <div key={c.key} className="flex items-center gap-3">
                                  <div className="w-20 text-xs text-muted-foreground">{c.label}</div>
                                  <Progress aria-label={`${c.label} score`} value={a.momentum[c.key]} className="h-1.5 flex-1" />
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
                              className="block rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-center text-xs font-semibold text-emerald-300 transition hover:bg-emerald-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
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
