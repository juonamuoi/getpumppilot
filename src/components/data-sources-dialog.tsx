// Small "Data sources" link shown near the wallet panel: price feed, refresh
// cadence, and exactly which tokens are excluded from portfolio totals.
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Info } from "lucide-react";

const ROWS: { label: string; value: string }[] = [
  { label: "Price feed", value: "CoinGecko public API (USD spot + 24h change)" },
  { label: "Balances", value: "Your browser wallet via read-only RPC (eth_call / eth_getLogs)" },
  { label: "Price refresh", value: "Every 60 seconds while the dashboard is open" },
  { label: "Balance refresh", value: "Every 60 seconds, plus manual Refresh" },
  { label: "Stablecoins", value: "USDC / USDT valued at a 1.00 USD peg, not a live quote" },
];

const EXCLUDED = [
  "Auto-detected ERC-20s with no CoinGecko listing — badged “no live price”.",
  "Tokens whose symbol or decimals can’t be read from the contract.",
  "Suspected airdrop/spam tokens surfaced by Transfer-log scanning.",
  "Demo tokens from the simulated universe — they never touch wallet totals.",
  "NFTs, LP positions, staked or bridged balances (not yet indexed).",
];

export function DataSourcesDialog() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1 text-[11px] text-muted-foreground underline underline-offset-2 transition-colors hover:text-foreground"
        >
          <Info className="h-3 w-3" /> Data sources
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2 text-base">
            Data sources
            <Badge
              variant="outline"
              className="border-emerald-500/40 text-[10px] uppercase text-emerald-300"
            >
              Read-only
            </Badge>
          </DialogTitle>
          <DialogDescription>
            Where wallet portfolio numbers come from and how fresh they are.
          </DialogDescription>
        </DialogHeader>

        <dl className="space-y-2 text-sm">
          {ROWS.map((r) => (
            <div key={r.label} className="flex flex-col gap-0.5 border-b border-border/50 pb-2">
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">{r.label}</dt>
              <dd className="text-foreground">{r.value}</dd>
            </div>
          ))}
        </dl>

        <div className="space-y-1.5">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Excluded from totals &amp; allocation
          </p>
          <ul className="space-y-1 text-sm text-muted-foreground">
            {EXCLUDED.map((e) => (
              <li key={e} className="flex gap-2">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-amber-400" />
                <span>{e}</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="text-xs text-muted-foreground">
          Prices are probabilistic indicators, not guarantees. Trading execution is disabled
          app-wide.
        </p>
      </DialogContent>
    </Dialog>
  );
}
