import { withSocialMeta } from "@/lib/social-meta";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { DemoBadge, DisclaimerBanner } from "@/components/disclaimer";
import { getAsset, fmtPct, fmtUsd } from "@/lib/mock-data";
import { useLiveAsset } from "@/lib/live-assets";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MomentumBreakdown } from "@/components/momentum";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { usePaper } from "@/lib/paper-store";
import { trackFunnelStep } from "@/lib/funnel";
import { toast } from "sonner";
import { ArrowLeft, Lock } from "lucide-react";
import { PageBreadcrumbs } from "@/components/page-breadcrumbs";
import { AssetShareButtons } from "@/components/asset-share";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { FaqSection } from "@/components/faq-section";
import { assetFaqs } from "@/lib/page-faqs";
import { useExecutionAnnouncer } from "@/components/execution-announcer";
import { announceRiskBlock, riskBlockTitle } from "@/lib/risk-block";
import { requestTrade } from "@/lib/trade-gate";
import {
  SPARK_WINDOW_OPTIONS,
  sliceSparkline,
  type SparkWindowValue,
} from "@/lib/sparkline-window";

import {
  absoluteUrl,
  assetDemoDataNodes,
  assetSocialImageUrl,
  breadcrumbSchema,
  faqSchema,
  ldScript,
  pageEntityGraph,
  webPageSchema,
} from "@/lib/structured-data";


export const Route = createFileRoute("/asset/$symbol")({
  validateSearch: (search: Record<string, unknown>): { w?: SparkWindowValue } => {
    const w = search.w;
    return SPARK_WINDOW_OPTIONS.some((o) => o.value === w) ? { w: w as SparkWindowValue } : {};
  },
  head: ({ params }) => {

    const sym = params.symbol.toUpperCase();
    const asset = getAsset(params.symbol);
    const name = asset?.name ?? sym;
    const slug = params.symbol.toLowerCase();
    const url = absoluteUrl(`/asset/${slug}`);
    const image = assetSocialImageUrl(slug);
    const description = `${sym} momentum, chart and paper trading. Demo data only.`;
    const socialDescription = `Explainable momentum score, chart and paper trading for ${name} (${sym}) on PumpPilot AI. Demo data.`;
    return {
      links: [{ rel: "canonical", href: url }],
      meta: withSocialMeta([
        { title: `${sym} — PumpPilot AI` },
        { name: "description", content: description },
        { property: "og:title", content: `${name} (${sym}) momentum — PumpPilot AI` },
        { property: "og:description", content: socialDescription },
        { property: "og:url", content: url },
        { property: "og:image", content: image },
        { property: "og:image:width", content: "1200" },
        { property: "og:image:height", content: "630" },
        { property: "og:image:alt", content: `${name} (${sym}) momentum card — PumpPilot AI` },
        { name: "twitter:image", content: image },
        { name: "twitter:image:alt", content: `${name} (${sym}) momentum card — PumpPilot AI` },
      ]),
      scripts: [
        ldScript(
          pageEntityGraph([
            webPageSchema({
              name: `${name} (${sym}) momentum & paper trading`,
              description,
              path: `/asset/${slug}`,
            }),
            breadcrumbSchema([
              { name: "Scanner", path: "/scanner" },
              { name: sym, path: `/asset/${slug}` },
            ]),
            faqSchema(assetFaqs(sym, name), `/asset/${slug}`),
            ...(asset ? assetDemoDataNodes(asset) : []),
          ]),
        ),
      ],
    };
  },
  component: AssetPage,
});


function AssetPage() {
  const { symbol } = Route.useParams();
  const { w } = Route.useSearch();
  const asset = useLiveAsset(symbol);
  const navigate = useNavigate();
  const paper = usePaper();
  const [qty, setQty] = useState("");
  const { announce, region: announcerRegion } = useExecutionAnnouncer();
  const horizon: SparkWindowValue = w ?? "24h";


  // Activation milestone: the visitor reached their first asset chart.
  useEffect(() => {
    void trackFunnelStep("first_chart");
  }, []);

  if (!asset) {
    return (
      <AppShell>
        <div className="rounded-xl border border-border/60 bg-card/60 p-8 text-center">
          <div className="text-lg font-semibold">Asset not found</div>
          <Button variant="link" onClick={() => navigate({ to: "/scanner" })}>
            Back to scanner
          </Button>
        </div>
      </AppShell>
    );
  }

  const chartData = sliceSparkline(asset.sparkline, horizon).map((v, i) => ({ i, v }));
  const positive = asset.change24h >= 0;

  const doTrade = (side: "buy" | "sell") => {
    const n = parseFloat(qty);
    if (!n || n <= 0) {
      announce("Order rejected: enter a positive quantity.", "assertive", "essential");
      return toast.error("Enter a positive quantity");
    }
    announce(
      `Paper order placed: ${side} ${n} ${asset.symbol}. Confirm the safety notice to continue.`,
      "polite",
      "detail",
    );
    // Global safety gate — nothing is submitted until the notice is acknowledged.
    requestTrade({
      action: `${side.toUpperCase()} ${n} ${asset.symbol}`,
      mode: "paper",
      detail: "Simulated order — no wallet signature and no on-chain submission.",
      onConfirm: () => {
        const r = paper.trade(asset.symbol, side, n);
        if (r.ok) {
          toast.success(r.msg);
          announce(
            `Paper order filled: ${side} ${n} ${asset.symbol}. ${r.msg}`,
            "polite",
            "essential",
          );
          setQty("");
        } else if (r.block) {
          toast.error(`Blocked by ${riskBlockTitle(r.block)}`, { description: r.msg });
          announce(
            announceRiskBlock(r.block, side, n, asset.symbol),
            "assertive",
            "essential",
          );
        } else {
          toast.error(r.msg);
          announce(`Paper order rejected: ${r.msg}`, "assertive", "essential");
        }
      },
    });
  };

  return (
    <AppShell>
      <div className="space-y-5">
        {announcerRegion}
        <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
          Execution mode: PAPER. Orders on this page are simulated.
        </div>
        <PageBreadcrumbs
          crumbs={[
            { name: "Scanner", path: "/scanner" },
            { name: asset.symbol, path: `/asset/${asset.symbol.toLowerCase()}` },
          ]}
        />

        <Link
          to="/scanner"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Scanner
        </Link>

        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 sm:flex sm:items-end sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-2xl font-bold sm:text-3xl">{asset.symbol}</h1>
              {asset.isDemo && <DemoBadge />}
            </div>
            <div className="truncate text-sm text-muted-foreground">{asset.name}</div>
          </div>
          <div className="text-right">
            <div className="font-mono text-2xl font-bold">{fmtUsd(asset.price)}</div>
            <div className={`font-mono text-sm ${positive ? "text-emerald-400" : "text-rose-400"}`}>
              {fmtPct(asset.change24h)} 24h
            </div>
          </div>
        </div>

        <AssetShareButtons symbol={asset.symbol} />

        <DisclaimerBanner />


        <div className="grid gap-5 lg:grid-cols-3">
          <Card className="border-border/60 bg-card/60 lg:col-span-2">
            <CardHeader className="flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-base">
                Price · {horizon} {asset.isLive ? "· live" : "(demo)"}
              </CardTitle>
              <div
                role="group"
                aria-label="Chart time window"
                className="flex overflow-hidden rounded-md border border-border/60 text-xs"
              >
                {SPARK_WINDOW_OPTIONS.map((o) => (
                  <Link
                    key={o.value}
                    to="/asset/$symbol"
                    params={{ symbol }}
                    search={{ w: o.value }}
                    replace
                    aria-current={horizon === o.value ? "true" : undefined}
                    className={`px-2.5 py-1 transition-colors ${
                      horizon === o.value
                        ? "bg-primary/20 text-foreground"
                        : "text-muted-foreground hover:bg-muted/40"
                    }`}
                  >
                    {o.label}
                  </Link>
                ))}
              </div>
            </CardHeader>

            <CardContent className="h-72 pl-0">
              <p className="sr-only">
                {`Line chart of ${asset.name} (${asset.symbol}) price over the ${horizon} window. Latest price ${fmtUsd(asset.price)}, ${fmtPct(asset.change24h)} over 24 hours. Range ${fmtUsd(Math.min(...chartData.map((d) => d.v)))} to ${fmtUsd(Math.max(...chartData.map((d) => d.v)))}.`}
              </p>
              <div aria-hidden className="h-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="oklch(0.78 0.17 160)" stopOpacity={0.5} />
                      <stop offset="100%" stopColor="oklch(0.78 0.17 160)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="i" hide />
                  <YAxis
                    domain={["dataMin", "dataMax"]}
                    tick={{ fill: "oklch(0.7 0.03 258)", fontSize: 11 }}
                    width={60}
                    tickFormatter={(v: number) => fmtUsd(v)}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "oklch(0.2 0.025 260)",
                      border: "1px solid oklch(0.3 0.02 260)",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                    formatter={(v: number) => fmtUsd(v)}
                    labelFormatter={() => ""}
                  />
                  <Area
                    type="monotone"
                    dataKey="v"
                    stroke="oklch(0.78 0.17 160)"
                    strokeWidth={2}
                    fill="url(#g)"
                  />
                </AreaChart>
              </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/60 bg-card/60">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Momentum score</CardTitle>
            </CardHeader>
            <CardContent>
              <MomentumBreakdown asset={asset} />
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-5 lg:grid-cols-3">
          <Card className="border-border/60 bg-card/60 lg:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Market stats</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
              <Stat label="Market cap" value={fmtUsd(asset.marketCap)} />
              <Stat label="24h volume" value={fmtUsd(asset.volume24h)} />
              <Stat label="Category" value={asset.category === "major" ? "Major" : "Demo small-cap"} />
              <Stat label="Data source" value={asset.isLive ? "CoinGecko · live" : "Mock / Demo"} />
            </CardContent>
          </Card>

          <Card className="border-emerald-500/20 bg-emerald-500/5">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center justify-between text-base">
                <span>Paper trade</span>
                <span className="inline-flex items-center gap-1 text-[11px] font-normal text-amber-300">
                  <Lock className="h-3 w-3" /> Live off
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="qty" className="text-xs">
                  Quantity
                </Label>
                <Input
                  id="qty"
                  inputMode="decimal"
                  value={qty}
                  onChange={(e) => setQty(e.target.value)}
                  placeholder="0.0"
                />
                <div className="text-[11px] text-muted-foreground">
                  ≈ {qty ? fmtUsd((parseFloat(qty) || 0) * asset.price) : "$0.00"}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button onClick={() => doTrade("buy")} className="bg-emerald-500 text-black hover:bg-emerald-400">
                  Buy
                </Button>
                <Button variant="outline" onClick={() => doTrade("sell")}>
                  Sell
                </Button>
              </div>
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                Simulated fills at the last quoted price. No real assets are moved.
              </p>
            </CardContent>
          </Card>
        </div>

        <FaqSection faqs={assetFaqs(asset.symbol, asset.name)} title={`${asset.symbol.toUpperCase()} FAQ`} />
      </div>
    </AppShell>

  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-0.5 font-mono">{value}</div>
    </div>
  );
}
