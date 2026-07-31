import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Check, Clock, Copy, Loader2, ShieldAlert, Trash2, Wallet } from "lucide-react";
import { toast } from "sonner";
import { pumpErrorMessage, setPumpPayoutAddress } from "@/lib/pump";

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

export type PayoutValidation = {
  state: "empty" | "valid" | "invalid";
  message: string;
};

/** Pure client-side pre-check; the database re-validates on save. */
export function validatePayoutAddress(raw: string): PayoutValidation {
  const v = raw.trim();
  if (!v) return { state: "empty", message: "No address set — PUMP stays in your in-app ledger." };
  if (!v.startsWith("0x"))
    return { state: "invalid", message: "Address must start with 0x." };
  if (v.length !== 42)
    return {
      state: "invalid",
      message: `Address must be 42 characters (currently ${v.length}).`,
    };
  if (!ADDRESS_RE.test(v))
    return { state: "invalid", message: "Address contains non-hexadecimal characters." };
  return { state: "valid", message: "Valid EVM address format." };
}

function shorten(a: string) {
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

function relative(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(diff)) return "";
  const m = Math.round(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
}

export function PumpPayoutSettings({
  address,
  updatedAt,
  onSaved,
}: {
  address: string | null;
  updatedAt: string | null;
  onSaved: () => void | Promise<void>;
}) {
  const [value, setValue] = useState(address ?? "");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setValue(address ?? "");
  }, [address]);

  const check = useMemo(() => validatePayoutAddress(value), [value]);
  const dirty = (value.trim() || null) !== (address ?? null);
  const canSave = dirty && check.state !== "invalid" && !busy;

  async function save(next: string) {
    setBusy(true);
    try {
      const res = await setPumpPayoutAddress(next);
      if (!res.ok) {
        toast.error(pumpErrorMessage(res.reason));
        return;
      }
      if (res.changed === false) toast.info("Address unchanged.");
      else if (res.payout_address) toast.success("Payout address updated");
      else toast.success("Payout address cleared");
      await onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save address");
    } finally {
      setBusy(false);
    }
  }

  function copy() {
    if (!address) return;
    void navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <Card data-testid="pump-payout-settings">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Wallet className="h-4 w-4 text-emerald-400" /> Settlement address
        </CardTitle>
        <CardDescription>
          Where your PUMP is sent when on-chain claims open. Read-only — we never request keys or
          seed phrases.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs uppercase tracking-wide text-muted-foreground">
              Current address
            </span>
            {address ? (
              <Badge variant="secondary" className="text-emerald-400">
                Set
              </Badge>
            ) : (
              <Badge variant="outline">Not set</Badge>
            )}
          </div>
          <div className="mt-1 flex items-center gap-2">
            <code className="truncate font-mono text-sm">
              {address ? shorten(address) : "—"}
            </code>
            {address ? (
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={copy}>
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              </Button>
            ) : null}
          </div>
          <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            {updatedAt
              ? `Last updated ${new Date(updatedAt).toLocaleString()} (${relative(updatedAt)})`
              : "Never updated"}
          </p>
        </div>

        <div className="space-y-2">
          <Input
            placeholder="0x…"
            spellCheck={false}
            autoComplete="off"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            aria-invalid={check.state === "invalid"}
            className={check.state === "invalid" ? "border-destructive" : undefined}
          />
          <p
            className={`text-xs ${
              check.state === "invalid"
                ? "text-destructive"
                : check.state === "valid"
                  ? "text-emerald-400"
                  : "text-muted-foreground"
            }`}
          >
            {check.message}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void save(value)} disabled={!canSave} className="flex-1">
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Save address
          </Button>
          {address ? (
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => {
                setValue("");
                void save("");
              }}
            >
              <Trash2 className="mr-2 h-4 w-4" /> Clear
            </Button>
          ) : null}
        </div>

        <p className="flex items-start gap-2 text-xs text-muted-foreground">
          <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" />
          Double-check the address — on-chain settlements sent to a wrong address cannot be
          recovered. PUMP is a reward token, not an investment.
        </p>
      </CardContent>
    </Card>
  );
}
