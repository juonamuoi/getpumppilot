/* ------------------------------------------------------------------ *
 * Live swap panel — real DEX routing, user-signed.
 *
 * Flow: quote (server-side aggregator) -> risk checks -> optional ERC-20
 * approval -> eth_sendTransaction in the user's own wallet. PumpPilot never
 * holds keys, never auto-trades, and never asks for a seed phrase.
 * ------------------------------------------------------------------ */
import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AlertTriangle, ArrowDownUp, ExternalLink, Loader2, ShieldAlert } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getSwapQuote, type SwapQuote } from "@/lib/dex.functions";
import { findToken, fromBaseUnits, toBaseUnits, tokensFor } from "@/lib/dex-tokens";
import {
  chainName,
  explorerTxUrl,
  LIVE_RISK_POINTS,
  useLiveTrading,
} from "@/lib/live-trading";
import { getInjectedProvider, useInjectedAccount } from "@/lib/wallet-balances";
import { livePriceOf } from "@/lib/live-price-registry";
import { ConnectWalletButton } from "@/components/connect-wallet-button";
import { PumpWalletPanel } from "@/components/pump-wallet-panel";
import { SwapErrorPanel } from "@/components/swap-error-panel";
import {
  IDLE_PROGRESS,
  SwapProgressSteps,
  type SwapProgress,
  type SwapStepId,
  type SwapStepStatus,
} from "@/components/swap-progress";
import {
  explainSwapError,
  type FriendlySwapError,
  type SwapErrorStage,
} from "@/lib/swap-errors";


function encodeApprove(spender: string, amountHex: string) {
  // approve(address,uint256)
  const pad = (h: string) => h.replace(/^0x/, "").toLowerCase().padStart(64, "0");
  return `0x095ea7b3${pad(spender)}${pad(amountHex)}`;
}

export function LiveSwapPanel() {
  const settings = useLiveTrading();
  const { address } = useInjectedAccount();
  const quoteFn = useServerFn(getSwapQuote);

  const tokens = tokensFor(settings.chainId);
  const [sellSymbol, setSellSymbol] = useState(tokens[0]?.symbol ?? "ETH");
  const [buySymbol, setBuySymbol] = useState(tokens[1]?.symbol ?? "USDC");
  const [amount, setAmount] = useState("");
  const [quote, setQuote] = useState<SwapQuote | null>(null);
  const [busy, setBusy] = useState<null | "quote" | "approve" | "swap">(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [failure, setFailure] = useState<FriendlySwapError | null>(null);
  const [progress, setProgress] = useState<SwapProgress>(IDLE_PROGRESS);

  const sell = findToken(settings.chainId, sellSymbol);
  const buy = findToken(settings.chainId, buySymbol);

  const notionalUsd = useMemo(() => {
    const px = sell ? livePriceOf(sell.symbol) : undefined;
    const qty = Number(amount);
    if (!px || !Number.isFinite(qty)) return null;
    return px * qty;
  }, [sell, amount]);

  const overLimit = notionalUsd !== null && notionalUsd > settings.maxTradeUsd;

  if (settings.mode !== "live") return null;

  function step(id: SwapStepId, status: SwapStepStatus, note?: string) {
    setProgress((p) => ({ ...p, [id]: { status, note } }));
  }

  function fail(e: unknown, stage: SwapErrorStage) {
    const friendly = explainSwapError(e, stage, {
      sellSymbol,
      chainName: chainName(settings.chainId),
    });
    setFailure(friendly);
    const stepId: SwapStepId =
      stage === "quote" ? "quote" : stage === "approve" ? "approve" : "submit";
    step(stepId, "error", friendly.title);
    if (friendly.userRejected) toast.info(friendly.title);
    else toast.error(friendly.title);
  }

  async function ensureChain(): Promise<boolean> {
    const provider = getInjectedProvider();
    if (!provider) return false;
    try {
      const current = Number(await provider.request({ method: "eth_chainId" }));
      if (current === settings.chainId) return true;
      await provider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: `0x${settings.chainId.toString(16)}` }],
      });
      return true;
    } catch (e) {
      fail(e, "chain");
      return false;
    }
  }

  async function handleQuote() {
    if (!address) {
      toast.error("Connect a wallet first.");
      return;
    }
    if (!sell || !buy) return;
    const base = toBaseUnits(amount, sell.decimals);
    if (base === "0") {
      toast.error("Enter an amount to sell.");
      return;
    }
    setBusy("quote");
    setTxHash(null);
    setFailure(null);
    step("quote", "active", "Finding the best route across DEX liquidity…");
    try {
      const q = await quoteFn({
        data: {
          chainId: settings.chainId,
          sellToken: sell.address,
          buyToken: buy.address,
          sellAmount: base,
          taker: address,
          slippageBps: settings.slippageBps,
        },
      });
      setQuote(q);
      if (!q.ok) {
        fail(new Error(q.error ?? "Quote failed."), "quote");
        return;
      }
      step("quote", "done", "Route ready — review the numbers below.");
      if (q.allowanceTarget) {
        step("approve", "idle", `One-time ${sellSymbol} approval required first.`);
      } else {
        step("approve", "skipped", `${sellSymbol} needs no approval.`);
      }
      step("submit", "idle");
      step("confirm", "idle");
    } catch (e) {
      fail(e, "quote");
    } finally {
      setBusy(null);
    }
  }

  /** Poll for a receipt; resolves null when it never lands in the window. */
  async function waitForReceipt(
    provider: { request: (a: { method: string; params?: unknown[] }) => Promise<unknown> },
    hash: string,
    tries = 60,
  ): Promise<{ status?: string } | null> {
    for (let i = 0; i < tries; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      const receipt = (await provider
        .request({ method: "eth_getTransactionReceipt", params: [hash] })
        .catch(() => null)) as { status?: string } | null;
      if (receipt) return receipt;
    }
    return null;
  }

  async function handleSwap() {
    const provider = getInjectedProvider();
    if (!provider || !address || !quote?.ok || !quote.transaction || !sell) return;
    if (overLimit) {
      toast.error(`Trade exceeds your $${settings.maxTradeUsd} per-trade limit.`);
      return;
    }
    setFailure(null);
    if (!(await ensureChain())) return;

    const stage: SwapErrorStage = quote.allowanceTarget ? "approve" : "swap";
    try {
      if (quote.allowanceTarget) {
        setBusy("approve");
        step("approve", "active", "Confirm the approval in your wallet…");
        const max = "f".repeat(64);
        const approvalHash = (await provider.request({
          method: "eth_sendTransaction",
          params: [
            {
              from: address,
              to: sell.address,
              data: encodeApprove(quote.allowanceTarget, max),
            },
          ],
        })) as string;
        toast.info("Approval submitted — waiting for confirmation, then we'll re-quote for you.");
        step("approve", "active", "Approval sent — waiting for it to confirm on-chain…");

        // Wait for the approval receipt so the user doesn't have to re-quote
        // by hand; poll for up to ~2 minutes, then hand control back.
        const receipt = await waitForReceipt(provider, approvalHash);
        setBusy(null);
        if (receipt) {
          step("approve", "done", "Approval confirmed.");
          toast.success("Approval confirmed — refreshing your quote.");
          await handleQuote();
        } else {
          step("approve", "active", "Still pending — tap “Get route & quote” once it confirms.");
          toast.warning("Approval is still pending. Tap “Get route & quote” once it confirms.");
        }
        return;
      }


      setBusy("swap");
      step("submit", "active", "Confirm the swap in your wallet…");
      const hash = (await provider.request({
        method: "eth_sendTransaction",
        params: [
          {
            from: address,
            to: quote.transaction.to,
            data: quote.transaction.data,
            value: `0x${BigInt(quote.transaction.value || "0").toString(16)}`,
            ...(quote.transaction.gas
              ? { gas: `0x${BigInt(quote.transaction.gas).toString(16)}` }
              : {}),
          },
        ],
      })) as string;
      setTxHash(hash);
      setQuote(null);
      step("submit", "done", `Broadcast as ${hash.slice(0, 10)}…${hash.slice(-6)}`);
      toast.success("Swap submitted to the network.");

      step("confirm", "active", "Waiting for the network to include your trade…");
      setBusy(null);
      const receipt = await waitForReceipt(provider, hash);
      if (!receipt) {
        step("confirm", "active", "Still pending — follow the transaction link below.");
      } else if (receipt.status === "0x0") {
        step("confirm", "error", "The transaction reverted on-chain. No swap took place.");
        toast.error("Swap reverted on-chain.");
      } else {
        step("confirm", "done", "Confirmed — tokens are in your wallet.");
        toast.success("Swap confirmed on-chain.");
      }
    } catch (e) {
      fail(e, stage);
    } finally {
      setBusy(null);
    }
  }


  /** One-click retry: pick the right action for the failure we saw. */
  async function handleRetry() {
    const action = failure?.retry ?? "requote";
    setFailure(null);
    if (action === "requote") {
      await handleQuote();
      return;
    }
    if (action === "switch-chain") {
      if (await ensureChain()) await handleQuote();
      return;
    }
    // "approve" and "swap" both resume the signing flow; re-quote first when
    // the route is gone so we never sign a stale transaction.
    if (!quote?.ok) {
      await handleQuote();
      return;
    }
    await handleSwap();
  }


  return (
    <Card className="border-destructive/40">
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <ArrowDownUp className="h-4 w-4 text-destructive" />
          Live swap
        </CardTitle>
        <Badge variant="destructive">Real funds · {chainName(settings.chainId)}</Badge>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-muted-foreground">
          <p className="mb-1 flex items-center gap-1 font-medium text-destructive">
            <ShieldAlert className="h-3.5 w-3.5" /> Irreversible, self-custodial execution
          </p>
          <ul className="list-disc space-y-0.5 pl-4">
            {LIVE_RISK_POINTS.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>

        {!address ? (
          <div className="space-y-3">
            <ConnectWalletButton label="Connect wallet to trade live" />
            <p className="text-center text-[11px] text-muted-foreground">or</p>
            <PumpWalletPanel />
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            Signing as <span className="font-mono">{address.slice(0, 6)}…{address.slice(-4)}</span>
          </p>
        )}



        <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label>Sell</Label>
            <Select value={sellSymbol} onValueChange={setSellSymbol}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {tokens.map((t) => (
                  <SelectItem key={t.symbol} value={t.symbol}>{t.symbol}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Buy</Label>
            <Select value={buySymbol} onValueChange={setBuySymbol}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {tokens.map((t) => (
                  <SelectItem key={t.symbol} value={t.symbol}>{t.symbol}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="live-amount">Amount ({sellSymbol})</Label>
            <Input
              id="live-amount"
              inputMode="decimal"
              placeholder="0.00"
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value);
                setQuote(null);
              }}
            />
          </div>
        </div>

        {notionalUsd !== null && (
          <p className={`text-xs ${overLimit ? "text-destructive" : "text-muted-foreground"}`}>
            ≈ ${notionalUsd.toLocaleString(undefined, { maximumFractionDigits: 2 })} notional ·
            limit ${settings.maxTradeUsd.toLocaleString()} per trade ·
            max slippage {(settings.slippageBps / 100).toFixed(2)}%
            {overLimit && " — raise the limit in Risk controls to proceed."}
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={handleQuote} disabled={busy !== null || !address}>
            {busy === "quote" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Get route &amp; quote
          </Button>
          <Button
            variant="destructive"
            onClick={handleSwap}
            disabled={busy !== null || !quote?.ok || overLimit}
          >
            {(busy === "swap" || busy === "approve") && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            {quote?.allowanceTarget ? `Approve ${sellSymbol}` : "Sign & submit swap"}
          </Button>
        </div>

        {failure && (
          <SwapErrorPanel
            error={failure}
            busy={busy !== null}
            onRetry={handleRetry}
            onDismiss={() => setFailure(null)}
          />
        )}



        {quote?.ok && buy && (
          <div className="space-y-1 rounded-md border border-border bg-muted/30 p-3 text-xs">
            <p className="font-medium text-foreground">
              Receive ≈ {fromBaseUnits(quote.buyAmount ?? "0", buy.decimals)} {buy.symbol}
            </p>
            <p className="text-muted-foreground">
              Guaranteed minimum {fromBaseUnits(quote.minBuyAmount ?? "0", buy.decimals)} {buy.symbol}{" "}
              after slippage
            </p>
            {quote.route && quote.route.length > 0 && (
              <p className="text-muted-foreground">
                Routed via{" "}
                {quote.route
                  .map((r) => `${r.name} ${(r.proportion * 100).toFixed(0)}%`)
                  .join(" · ")}
              </p>
            )}
            {quote.allowanceTarget && (
              <p className="flex items-center gap-1 text-destructive">
                <AlertTriangle className="h-3.5 w-3.5" />
                One-time {sellSymbol} approval required before the swap.
              </p>
            )}
          </div>
        )}

        {txHash && (
          <a
            className="inline-flex items-center gap-1 text-xs text-primary underline"
            href={explorerTxUrl(settings.chainId, txHash)}
            target="_blank"
            rel="noreferrer"
          >
            View transaction <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </CardContent>
    </Card>
  );
}
