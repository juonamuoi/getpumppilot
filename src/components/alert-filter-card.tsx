import { useMemo } from "react";
import { Filter, RotateCcw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  clearAlertFilters,
  toggleAlertToken,
  toggleAlertWallet,
  useWalletMonitor,
  useWalletSession,
} from "@/lib/wallet-session";
import { shortAddress } from "@/lib/wallet-scan";

/** Tokens we always offer, plus anything found in the latest scan. */
const BASE_TOKENS = ["USDC", "USDT", "WETH", "SOL-DEMO", "DEMOCAT"];

function Chip({
  label,
  active,
  onClick,
  title,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={active}
      className={`rounded-full border px-2.5 py-1 text-xs transition ${
        active
          ? "border-primary/60 bg-primary/15 text-primary"
          : "border-border/60 bg-background/40 text-muted-foreground hover:text-foreground"
      }`}
    >
      {label}
    </button>
  );
}

/**
 * Alert scope filters — restrict risky-approval notifications to the
 * tokens and wallets the user cares about. Filtering affects notifications
 * only; scans, the security log and reports still capture every threat.
 */
export function AlertFilterCard({ address }: { address: string | null }) {
  const monitor = useWalletMonitor();
  const session = useWalletSession();

  const tokens = useMemo(() => {
    const found = (session.scan?.approvals ?? []).map((a) => a.token.toUpperCase());
    return Array.from(new Set([...BASE_TOKENS, ...found, ...monitor.alertTokens])).sort();
  }, [session.scan, monitor.alertTokens]);

  const wallets = useMemo(() => {
    const list = new Set(monitor.alertWallets);
    if (address) list.add(address.toLowerCase());
    return Array.from(list);
  }, [address, monitor.alertWallets]);

  const filtered = monitor.alertTokens.length > 0 || monitor.alertWallets.length > 0;

  return (
    <section className="rounded-xl border border-border/60 bg-card/60 p-4 sm:p-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Filter className="h-4 w-4 text-primary" /> Alert filters
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Only get push, email and in-app alerts for approvals on the tokens and wallets you
            select. Nothing selected = alert on everything. Scans and reports always keep the full
            picture.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={filtered ? "default" : "secondary"}>
            {filtered ? "Filtered" : "All alerts"}
          </Badge>
          <Button size="sm" variant="ghost" disabled={!filtered} onClick={clearAlertFilters}>
            <RotateCcw className="mr-1 h-3.5 w-3.5" /> Reset
          </Button>
        </div>
      </header>

      <div className="mt-4">
        <p className="text-xs font-medium text-muted-foreground">Tokens</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {tokens.map((t) => (
            <Chip
              key={t}
              label={t}
              active={monitor.alertTokens.includes(t)}
              onClick={() => toggleAlertToken(t)}
            />
          ))}
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          {monitor.alertTokens.length === 0
            ? "All tokens alerting."
            : `Alerting on ${monitor.alertTokens.length} token${monitor.alertTokens.length > 1 ? "s" : ""}.`}
        </p>
      </div>

      <div className="mt-4">
        <p className="text-xs font-medium text-muted-foreground">Wallets</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {wallets.length === 0 && (
            <span className="text-xs text-muted-foreground">
              Connect a wallet to scope alerts by address.
            </span>
          )}
          {wallets.map((w) => (
            <Chip
              key={w}
              label={shortAddress(w)}
              title={w}
              active={monitor.alertWallets.includes(w)}
              onClick={() => toggleAlertWallet(w)}
            />
          ))}
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          {monitor.alertWallets.length === 0
            ? "All connected wallets alerting."
            : `Alerting on ${monitor.alertWallets.length} wallet${monitor.alertWallets.length > 1 ? "s" : ""}.`}
        </p>
      </div>
    </section>
  );
}
