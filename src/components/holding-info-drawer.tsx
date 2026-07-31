// Per-holding info drawer: why it is (or isn't) priced, contract details and
// a balance breakdown. Read-only — nothing here can move funds.
import { Info, ExternalLink, Copy, ShieldAlert, ShieldCheck, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { toast } from "sonner";
import { fmtUsd } from "@/lib/mock-data";
import {
  balanceBreakdown,
  diagnoseHolding,
  explorerLink,
  type PriceDiagnosis,
} from "@/lib/holding-diagnosis";
import type { HoldingLike } from "@/lib/holding-filters";
import { SpamSignalsPanel } from "@/components/spam-signals-panel";
import { useSpamLists } from "@/lib/spam-lists";
import type { SpamInput } from "@/lib/spam-signals";

type Row = HoldingLike & {
  livePriced?: boolean;
  usdPeg?: number;
  decimals?: number;
};

const TONE: Record<PriceDiagnosis["tone"], string> = {
  ok: "border-emerald-500/40 text-emerald-300",
  warn: "border-amber-500/40 text-amber-300",
  error: "border-rose-500/40 text-rose-300",
};

function Field({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border/40 py-1.5 text-xs last:border-0">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className={`min-w-0 break-all text-right ${mono ? "font-mono" : ""}`}>{value}</span>
    </div>
  );
}

export function HoldingInfoDrawer({
  holding,
  chainId,
  chainName,
  priceUpdatedAt,
}: {
  holding: Row;
  chainId?: number;
  chainName?: string;
  priceUpdatedAt?: number;
}) {
  const { lists } = useSpamLists();
  const d = diagnoseHolding(holding, lists);
  const bb = balanceBreakdown(holding.amount, holding.decimals);
  const explorer = explorerLink(chainId, holding.address);
  const Icon = d.tone === "ok" ? ShieldCheck : d.tone === "warn" ? AlertTriangle : ShieldAlert;

  const copy = (text: string, what: string) => {
    void navigator.clipboard.writeText(text).then(
      () => toast.success(`${what} copied`),
      () => toast.error("Copy failed"),
    );
  };

  return (
    <Drawer>
      <DrawerTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-muted-foreground hover:text-foreground"
          aria-label={`Why ${holding.symbol} shows as ${d.label}`}
          title={`Why ${holding.symbol} shows as ${d.label}`}
        >
          <Info className="h-3.5 w-3.5" />
        </Button>
      </DrawerTrigger>

      <DrawerContent className="max-h-[88vh]">
        <div className="mx-auto w-full max-w-lg overflow-y-auto px-4">
          <DrawerHeader className="px-0">
            <DrawerTitle className="flex flex-wrap items-center gap-2 text-base">
              {holding.symbol}
              <Badge variant="outline" className={`text-[9px] uppercase ${TONE[d.tone]}`}>
                {d.label}
              </Badge>
              {holding.discovered && (
                <Badge
                  variant="outline"
                  className="border-sky-500/30 text-[9px] uppercase text-sky-300"
                >
                  auto-detected
                </Badge>
              )}
            </DrawerTitle>
            <DrawerDescription className="text-left">
              {holding.name !== holding.symbol ? `${holding.name} · ` : ""}
              {holding.kind === "native" ? "Native coin" : "ERC-20 token"}
              {chainName ? ` on ${chainName}` : ""}
            </DrawerDescription>
          </DrawerHeader>

          <div
            className={`flex gap-2 rounded-lg border p-3 text-xs leading-relaxed ${
              d.tone === "ok"
                ? "border-emerald-500/30 bg-emerald-500/[0.06]"
                : d.tone === "warn"
                  ? "border-amber-500/40 bg-amber-500/[0.07]"
                  : "border-rose-500/40 bg-rose-500/[0.07]"
            }`}
          >
            <Icon className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="space-y-2">
              <p>{d.reason}</p>
              {d.fixes.length > 0 && (
                <ul className="list-disc space-y-1 pl-4 text-muted-foreground">
                  {d.fixes.map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
              )}
              <p className="text-[11px] text-muted-foreground">
                {d.counted
                  ? "Counted in wallet value, 24h change and allocation."
                  : "Excluded from wallet value, 24h change and allocation."}
              </p>
            </div>
          </div>

          <div className="mt-4">
            <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Contract details
            </h4>
            <Field label="Type" value={holding.kind === "native" ? "Native coin" : "ERC-20"} />
            <Field label="Network" value={chainName ?? (chainId ? `Chain ${chainId}` : "—")} />
            <Field label="Chain ID" value={chainId ?? "—"} mono />
            <Field
              label="Contract"
              value={holding.address ?? "n/a (native coin)"}
              mono
            />
            <Field label="Decimals" value={bb.decimals} mono />
            <Field
              label="Discovery"
              value={
                holding.discovered
                  ? "Auto-detected from transfer logs"
                  : holding.kind === "native"
                    ? "Chain native balance"
                    : "Pre-configured token list"
              }
            />
            <Field label="Price source" value={d.code === "usd-peg" ? "Fixed USD peg ($1.00)" : d.code === "live" || d.code === "stale" ? "CoinGecko live feed" : "None"} />
            <Field
              label="Last price fetch"
              value={priceUpdatedAt ? new Date(priceUpdatedAt).toLocaleString() : "not yet fetched"}
            />
          </div>

          <div className="mt-4">
            <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Balance breakdown
            </h4>
            <Field
              label="Balance"
              value={`${holding.amount.toLocaleString(undefined, { maximumFractionDigits: 8 })} ${holding.symbol}`}
              mono
            />
            <Field label="Whole units" value={bb.whole.toLocaleString()} mono />
            <Field
              label="Fractional"
              value={bb.fraction.toFixed(Math.min(bb.decimals, 8)).replace(/^0/, "0")}
              mono
            />
            <Field label="Base units (approx.)" value={bb.baseUnits} mono />
            <Field
              label="Unit price"
              value={holding.price != null ? fmtUsd(holding.price) : "unavailable"}
              mono
            />
            <Field
              label="Value"
              value={
                holding.value != null && d.counted ? fmtUsd(holding.value) : "not counted"
              }
              mono
            />
          </div>

          <SpamSignalsPanel holding={holding as SpamInput} />

          <DrawerFooter className="flex-row flex-wrap gap-2 px-0">
            {holding.address && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => copy(holding.address!, "Contract address")}
              >
                <Copy className="mr-1.5 h-3.5 w-3.5" /> Copy address
              </Button>
            )}
            {explorer && (
              <Button variant="outline" size="sm" asChild>
                <a href={explorer.href} target="_blank" rel="noopener noreferrer nofollow">
                  <ExternalLink className="mr-1.5 h-3.5 w-3.5" /> View on {explorer.name}
                </a>
              </Button>
            )}
            <DrawerClose asChild>
              <Button size="sm" className="ml-auto">
                Close
              </Button>
            </DrawerClose>
          </DrawerFooter>

          <p className="pb-4 text-[10px] leading-relaxed text-muted-foreground">
            Read-only diagnostics. PumpPilot never asks for seed phrases, never signs approvals,
            and cannot move funds. Prices are probabilistic indicators, not financial advice.
          </p>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
