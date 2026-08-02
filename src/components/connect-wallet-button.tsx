/* ------------------------------------------------------------------ *
 * One-tap real wallet connect.
 *
 * Detects the browser's injected EIP-1193 provider (MetaMask, Rabby,
 * Coinbase Wallet, Brave, Trust…), connects with a single tap, and — on
 * mobile browsers with no injected provider — offers deep links that
 * reopen this exact page inside the wallet app so the connect works.
 *
 * Read-only account access only. No seed phrase, ever.
 * ------------------------------------------------------------------ */
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Check, Copy, ExternalLink, Loader2, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getInjectedProvider, useInjectedAccount } from "@/lib/wallet-balances";
import { chainName, useLiveTrading } from "@/lib/live-trading";

export function shortAddr(a: string) {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

/** Detected wallet brand, used only for a friendlier label. */
export function detectWalletName(): string {
  if (typeof window === "undefined") return "wallet";
  const eth = (window as unknown as Record<string, Record<string, boolean> | undefined>)["ethereum"];
  if (!eth) return "wallet";
  if (eth["isRabby"]) return "Rabby";
  if (eth["isCoinbaseWallet"]) return "Coinbase Wallet";
  if (eth["isTrust"]) return "Trust Wallet";
  if (eth["isBraveWallet"]) return "Brave Wallet";
  if (eth["isMetaMask"]) return "MetaMask";
  return "wallet";
}

/** Deep links that reopen the current page inside a wallet's in-app browser. */
export function walletDeepLinks(): { name: string; url: string }[] {
  if (typeof window === "undefined") return [];
  const host = window.location.host + window.location.pathname;
  const full = window.location.href;
  return [
    { name: "Open in MetaMask", url: `https://metamask.app.link/dapp/${host}` },
    {
      name: "Open in Coinbase Wallet",
      url: `https://go.cb-w.com/dapp?cb_url=${encodeURIComponent(full)}`,
    },
    { name: "Open in Trust Wallet", url: `https://link.trustwallet.com/open_url?url=${encodeURIComponent(full)}` },
  ];
}

type Props = {
  className?: string;
  /** Switch the wallet to the trading chain right after connecting. */
  ensureChain?: boolean;
  label?: string;
  size?: "sm" | "default" | "lg";
};

export function ConnectWalletButton({
  className,
  ensureChain = true,
  label,
  size = "default",
}: Props) {
  const { address, available, connect } = useInjectedAccount();
  const settings = useLiveTrading();
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [chainId, setChainId] = useState<number | null>(null);

  // Track the wallet's active network so the UI can offer a one-tap switch.
  useEffect(() => {
    const provider = getInjectedProvider();
    if (!provider) return;
    let alive = true;
    void provider
      .request({ method: "eth_chainId" })
      .then((id) => {
        if (alive) setChainId(Number(id));
      })
      .catch(() => undefined);
    const onChain = (...args: never[]) => setChainId(Number(args[0]));
    provider.on?.("chainChanged", onChain);
    return () => {
      alive = false;
      provider.removeListener?.("chainChanged", onChain);
    };
  }, [address]);

  const switchChain = useCallback(async () => {
    const provider = getInjectedProvider();
    if (!provider) return;
    try {
      await provider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: `0x${settings.chainId.toString(16)}` }],
      });
      toast.success(`Switched to ${chainName(settings.chainId)}`);
    } catch {
      toast.error(`Approve the network switch to ${chainName(settings.chainId)} in your wallet.`);
    }
  }, [settings.chainId]);

  const handleConnect = async () => {
    setBusy(true);
    try {
      const next = await connect();
      if (next) {
        toast.success(`${detectWalletName()} connected · ${shortAddr(next)}`);
        if (ensureChain) await switchChain();
      }
    } catch {
      toast.error("Wallet connection cancelled — approve the request in your wallet to continue.");
    } finally {
      setBusy(false);
    }
  };

  if (address) {
    const wrongChain = chainId !== null && chainId !== settings.chainId;
    return (
      <div className={`space-y-2 ${className ?? ""}`}>
        <div className="flex items-center justify-between gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-3 py-2">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-emerald-300">
              <Check className="h-3.5 w-3.5" aria-hidden="true" /> {detectWalletName()} connected
            </p>
            <p className="truncate font-mono text-[11px] text-muted-foreground">
              {shortAddr(address)} · {chainId ? chainName(chainId) : "—"}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            aria-label="Copy wallet address"
            onClick={() => {
              void navigator.clipboard?.writeText(address).then(() => {
                setCopied(true);
                window.setTimeout(() => setCopied(false), 1500);
              });
            }}
          >
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          </Button>
        </div>
        {wrongChain && (
          <Button variant="outline" size="sm" className="w-full" onClick={() => void switchChain()}>
            Switch to {chainName(settings.chainId)} to trade
          </Button>
        )}
      </div>
    );
  }

  if (!available) {
    return (
      <div className={`space-y-2 ${className ?? ""}`}>
        <p className="text-xs text-muted-foreground">
          No browser wallet detected. Open PumpPilot inside your wallet app to connect in one tap:
        </p>
        <div className="grid gap-2">
          {walletDeepLinks().map((l) => (
            <Button key={l.name} variant="secondary" size={size} className="justify-start" asChild>
              <a href={l.url} target="_blank" rel="noopener noreferrer">
                <Wallet className="mr-2 h-4 w-4" aria-hidden="true" /> {l.name}
                <ExternalLink className="ml-auto h-3.5 w-3.5 opacity-60" aria-hidden="true" />
              </a>
            </Button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <Button
      className={`w-full justify-center gap-2 ${className ?? ""}`}
      size={size}
      onClick={() => void handleConnect()}
      disabled={busy}
    >
      {busy ? (
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      ) : (
        <Wallet className="h-4 w-4" aria-hidden="true" />
      )}
      {label ?? `Connect ${detectWalletName()}`}
    </Button>
  );
}
