import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { withSocialMeta } from "@/lib/social-meta";
import { canonicalLinkFor, robotsMetaFor } from "@/lib/indexing-policy";
import { useAuth } from "@/lib/auth-store";
import {
  PUMP_HISTORY_PAGE_SIZE,
  fetchPumpTransferHistory,
  formatPump,
  isReceiptBalanced,
  receiptExplanation,
  receiptLines,
  type PumpTransferHistory,
  type PumpTransferReceipt,
} from "@/lib/pump";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  ArrowDownLeft,
  ArrowLeft,
  ArrowUpRight,
  Check,
  Copy,
  Loader2,
  Receipt,
  RefreshCw,
  Scale,
  TriangleAlert,
} from "lucide-react";
import { toast } from "sonner";

const PATH = "/pump-history";

export const Route = createFileRoute("/pump-history")({
  head: () => ({
    meta: withSocialMeta(
      [
        { title: "PUMP transfer history & receipts | PumpPilot AI" },
        {
          name: "description",
          content:
            "Every peer PUMP transfer with a double-entry receipt showing the debit, the matching credit, the resulting balance and the shared ledger reference.",
        },
        { property: "og:title", content: "PUMP transfer history & receipts" },
        {
          property: "og:description",
          content: "Double-entry receipts for every peer PUMP transfer in your PumpPilot account.",
        },
        { property: "og:type", content: "website" },
        ...robotsMetaFor(PATH),
      ],
      { url: `https://www.getpumppilot.app${PATH}` },
    ),
    links: canonicalLinkFor(PATH),
  }),
  component: PumpHistoryPage,
});

type Filter = "all" | "sent" | "received";

function PumpHistoryPage() {
  const { user, loading } = useAuth();
  const [data, setData] = useState<PumpTransferHistory | null>(null);
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [openRef, setOpenRef] = useState<string | null>(null);

  const load = useCallback(async (nextPage: number) => {
    setBusy(true);
    try {
      const res = await fetchPumpTransferHistory(
        PUMP_HISTORY_PAGE_SIZE,
        nextPage * PUMP_HISTORY_PAGE_SIZE,
      );
      if (!res.ok) {
        toast.error("Sign in to view your PUMP transfer history.");
        return;
      }
      setData(res);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not load transfer history");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (user) void load(page);
  }, [user, page, load]);

  const transfers = data?.transfers ?? [];
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return transfers.filter((t) => {
      if (filter !== "all" && t.direction !== filter) return false;
      if (!q) return true;
      return (
        (t.counterparty_tag ?? "").toLowerCase().includes(q) ||
        (t.memo ?? "").toLowerCase().includes(q) ||
        t.ref.toLowerCase().includes(q) ||
        String(t.amount).includes(q)
      );
    });
  }, [transfers, filter, query]);

  const totals = useMemo(() => {
    const sent = visible.filter((t) => t.direction === "sent");
    const received = visible.filter((t) => t.direction === "received");
    return {
      sent: sent.reduce((a, t) => a + t.amount, 0),
      received: received.reduce((a, t) => a + t.amount, 0),
      unbalanced: visible.filter((t) => !isReceiptBalanced(t)).length,
    };
  }, [visible]);

  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PUMP_HISTORY_PAGE_SIZE));

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <Button asChild variant="ghost" size="sm" className="-ml-2 h-7 px-2 text-muted-foreground">
          <Link to="/pump">
            <ArrowLeft className="mr-1 h-3.5 w-3.5" /> Back to PUMP
          </Link>
        </Button>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">PUMP transfer history</h1>
          <Badge variant="outline" className="border-emerald-500/40 text-emerald-400">
            Double-entry receipts
          </Badge>
        </div>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Every peer transfer is recorded as two ledger lines that must cancel to zero: a debit on
          the sender and an equal credit on the recipient, written in one atomic step and tied
          together by a shared reference. Open a receipt to see both lines.
        </p>
      </header>

      {!user && !loading ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Sign in to see your receipts</CardTitle>
            <CardDescription>
              Transfer receipts are private to your account and are never shown to anyone else.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link to="/auth">Sign in</Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {user ? (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard label="Transfers on this page" value={visible.length.toLocaleString()} />
            <StatCard
              label="Sent (filtered)"
              value={formatPump(totals.sent)}
              tone="text-rose-400"
            />
            <StatCard
              label="Received (filtered)"
              value={formatPump(totals.received)}
              tone="text-emerald-400"
            />
          </div>

          {totals.unbalanced > 0 ? (
            <Card className="border-amber-500/30 bg-amber-500/5">
              <CardContent className="flex gap-3 p-4 text-sm text-amber-200/90">
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                <p>
                  {totals.unbalanced} receipt{totals.unbalanced === 1 ? "" : "s"} on this page could
                  not be matched to a counterparty line. The amount shown is derived from your own
                  entry.
                </p>
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader className="gap-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Receipt className="h-4 w-4 text-emerald-400" /> Receipts
                  </CardTitle>
                  <CardDescription>
                    {total.toLocaleString()} peer transfer{total === 1 ? "" : "s"} on your ledger.
                  </CardDescription>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => void load(page)}
                  disabled={busy}
                >
                  {busy ? (
                    <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="mr-2 h-3.5 w-3.5" />
                  )}
                  Refresh
                </Button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {(["all", "sent", "received"] as Filter[]).map((f) => (
                  <Button
                    key={f}
                    size="sm"
                    variant={filter === f ? "default" : "outline"}
                    onClick={() => setFilter(f)}
                    className="capitalize"
                  >
                    {f}
                  </Button>
                ))}
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search tag, memo, amount or reference"
                  className="h-9 w-full sm:w-72"
                />
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {visible.map((t) => (
                <ReceiptRow
                  key={t.id}
                  transfer={t}
                  open={openRef === t.id}
                  onToggle={() => setOpenRef(openRef === t.id ? null : t.id)}
                />
              ))}
              {!busy && visible.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  {transfers.length === 0
                    ? "No peer transfers yet. Send PUMP from the PUMP page and the receipt shows up here."
                    : "No transfers match this filter."}
                </p>
              ) : null}
              {busy && visible.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">Loading receipts…</p>
              ) : null}
            </CardContent>
          </Card>

          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="text-muted-foreground">
              Page {page + 1} of {pages}
            </span>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={page === 0 || busy}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
              >
                Previous
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={page + 1 >= pages || busy}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

function StatCard({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
        <CardTitle className={`text-xl ${tone ?? ""}`}>{value}</CardTitle>
      </CardHeader>
    </Card>
  );
}

function ReceiptRow({
  transfer,
  open,
  onToggle,
}: {
  transfer: PumpTransferReceipt;
  open: boolean;
  onToggle: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const sent = transfer.direction === "sent";
  const lines = receiptLines(transfer);
  const balanced = isReceiptBalanced(transfer);

  function copyRef() {
    void navigator.clipboard.writeText(transfer.ref);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="rounded-lg border border-border/60 bg-card/40">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full flex-wrap items-center justify-between gap-3 p-3 text-left"
      >
        <span className="flex min-w-0 items-center gap-3">
          <span
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
              sent ? "bg-rose-500/10 text-rose-400" : "bg-emerald-500/10 text-emerald-400"
            }`}
          >
            {sent ? (
              <ArrowUpRight className="h-4 w-4" />
            ) : (
              <ArrowDownLeft className="h-4 w-4" />
            )}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium">
              {sent ? "Sent to" : "Received from"}{" "}
              <span className="font-mono">
                {transfer.counterparty_tag ? `@${transfer.counterparty_tag}` : "member"}
              </span>
            </span>
            <span className="block truncate text-xs text-muted-foreground">
              {new Date(transfer.created_at).toLocaleString()}
              {transfer.memo ? ` · ${transfer.memo}` : ""}
            </span>
          </span>
        </span>
        <span className="flex items-center gap-3 whitespace-nowrap">
          <span className={`text-sm font-semibold ${sent ? "text-rose-400" : "text-emerald-400"}`}>
            {sent ? "−" : "+"}
            {transfer.amount.toLocaleString()} PUMP
          </span>
          <Badge variant="outline" className="text-xs">
            {open ? "Hide receipt" : "Receipt"}
          </Badge>
        </span>
      </button>

      {open ? (
        <div className="space-y-3 border-t border-border/60 p-3">
          <p className="text-xs text-muted-foreground">{receiptExplanation(transfer)}</p>

          <div className="overflow-hidden rounded-md border border-border/60">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Account</th>
                  <th className="px-3 py-2 text-left font-medium">Entry</th>
                  <th className="px-3 py-2 text-right font-medium">Amount</th>
                  <th className="px-3 py-2 text-right font-medium">Balance after</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => (
                  <tr key={l.account} className="border-t border-border/60">
                    <td className="px-3 py-2 font-mono text-xs">{l.account}</td>
                    <td className="px-3 py-2">
                      <Badge
                        variant="outline"
                        className={
                          l.role === "Debit"
                            ? "border-rose-500/40 text-rose-400"
                            : "border-emerald-500/40 text-emerald-400"
                        }
                      >
                        {l.role}
                      </Badge>
                    </td>
                    <td
                      className={`px-3 py-2 text-right font-medium ${
                        l.delta < 0 ? "text-rose-400" : "text-emerald-400"
                      }`}
                    >
                      {l.delta > 0 ? "+" : ""}
                      {l.delta.toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-right text-muted-foreground">
                      {l.balanceAfter === null ? "private" : l.balanceAfter.toLocaleString()}
                    </td>
                  </tr>
                ))}
                <tr className="border-t border-border/60 bg-muted/20">
                  <td className="px-3 py-2 text-xs font-medium" colSpan={2}>
                    <span className="flex items-center gap-1.5">
                      <Scale className="h-3.5 w-3.5" /> Net ledger effect
                    </span>
                  </td>
                  <td
                    className={`px-3 py-2 text-right font-semibold ${
                      balanced ? "text-muted-foreground" : "text-amber-400"
                    }`}
                  >
                    {(lines[0].delta + lines[1].delta).toLocaleString()}
                  </td>
                  <td className="px-3 py-2 text-right text-xs text-muted-foreground">
                    {balanced ? "balanced" : "unmatched"}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <Separator />
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <span className="truncate">
              Ledger reference <span className="font-mono">{transfer.ref || "—"}</span> · entry kind{" "}
              <span className="font-mono">{transfer.kind}</span>
            </span>
            <Button size="sm" variant="ghost" className="h-7 px-2" onClick={copyRef}>
              {copied ? (
                <Check className="mr-1.5 h-3.5 w-3.5" />
              ) : (
                <Copy className="mr-1.5 h-3.5 w-3.5" />
              )}
              Copy reference
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
