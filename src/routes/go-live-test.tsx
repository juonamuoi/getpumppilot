import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { EmbeddedCheckoutProvider, EmbeddedCheckout } from "@stripe/react-stripe-js";
import { AlertTriangle, ArrowLeft, ArrowRight, CheckCircle2, ClipboardCopy, ExternalLink, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { PaymentTestModeBanner } from "@/components/payment-test-mode-banner";
import { useAuth } from "@/lib/auth-store";
import { getStripe, getStripeEnvironment } from "@/lib/stripe";
import { createGoLiveTestCheckout, getGoLiveTestSession } from "@/utils/payments.functions";

type SearchParams = { session_id?: string; step?: string };

export const Route = createFileRoute("/go-live-test")({
  head: () => ({
    meta: [
      { title: "Go-Live Payment Test — PumpPilot AI" },
      { name: "description", content: "Run a small live payment against your Stripe account and record the statement descriptor customers will see." },
      { property: "og:title", content: "PumpPilot AI Go-Live Test" },
      { property: "og:description", content: "Guided one-off live charge to verify checkout, receipts, and statement descriptor." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  validateSearch: (s: Record<string, unknown>): SearchParams => ({
    session_id: typeof s.session_id === "string" ? s.session_id : undefined,
    step: typeof s.step === "string" ? s.step : undefined,
  }),
  component: GoLiveTestPage,
});

const RECORD_KEY = "pumppilot.goLiveTest.record.v1";

type TestRecord = {
  sessionId: string;
  environment: string;
  amountCents: number;
  createdAt: string;
  status: string | null;
  paymentStatus: string | null;
  amountTotal: number | null;
  currency: string | null;
  paymentIntentId: string | null;
  chargeId: string | null;
  receiptUrl: string | null;
  last4: string | null;
  brand: string | null;
  stripeStatementDescriptor: string | null;
  observedStatementDescriptor?: string | null;
  descriptorMatch?: "match" | "mismatch" | "unknown";
  notes?: string;
  confirmedAt?: string;
};

function loadRecord(): TestRecord | null {
  try {
    const raw = localStorage.getItem(RECORD_KEY);
    return raw ? (JSON.parse(raw) as TestRecord) : null;
  } catch { return null; }
}
function saveRecord(rec: TestRecord | null) {
  if (rec === null) localStorage.removeItem(RECORD_KEY);
  else localStorage.setItem(RECORD_KEY, JSON.stringify(rec));
}

function currency(amountCents: number | null, cur: string | null) {
  if (amountCents == null || !cur) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: cur.toUpperCase() }).format(amountCents / 100);
}

function GoLiveTestPage() {
  const navigate = useNavigate();
  const search = useSearch({ from: "/go-live-test" });
  const { user } = useAuth();

  const env = useMemo(() => {
    try { return getStripeEnvironment(); } catch { return null; }
  }, []);
  const isLive = env === "live";

  const [amountUsd, setAmountUsd] = useState<string>("1.00");
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(search.session_id ?? null);
  const [starting, setStarting] = useState(false);
  const [record, setRecord] = useState<TestRecord | null>(() => loadRecord());
  const [verifying, setVerifying] = useState(false);
  const [observed, setObserved] = useState<string>(record?.observedStatementDescriptor ?? "");
  const [notes, setNotes] = useState<string>(record?.notes ?? "");

  // When Stripe returns us with ?session_id=..., fetch and record it.
  useEffect(() => {
    if (!search.session_id || !env) return;
    (async () => {
      setVerifying(true);
      try {
        const r = await getGoLiveTestSession({ data: { sessionId: search.session_id!, environment: env } });
        if ("error" in r) throw new Error(r.error);
        const cents = record?.amountCents ?? r.amountTotal ?? 0;
        const rec: TestRecord = {
          sessionId: search.session_id!,
          environment: env,
          amountCents: cents,
          createdAt: r.created ?? new Date().toISOString(),
          status: r.status,
          paymentStatus: r.paymentStatus,
          amountTotal: r.amountTotal,
          currency: r.currency,
          paymentIntentId: r.paymentIntentId,
          chargeId: r.chargeId,
          receiptUrl: r.receiptUrl,
          last4: r.last4,
          brand: r.brand,
          stripeStatementDescriptor: r.statementDescriptor,
          observedStatementDescriptor: record?.observedStatementDescriptor ?? null,
          descriptorMatch: record?.descriptorMatch,
          notes: record?.notes,
          confirmedAt: record?.confirmedAt,
        };
        saveRecord(rec);
        setRecord(rec);
        setSessionId(search.session_id!);
        setClientSecret(null);
        toast.success("Payment recorded. Now verify the statement descriptor.");
      } catch (e: any) {
        toast.error(e?.message ?? "Could not fetch session");
      } finally {
        setVerifying(false);
        // strip session_id from URL
        navigate({ to: "/go-live-test", search: {}, replace: true });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search.session_id, env]);

  const refreshSession = async () => {
    if (!record || !env) return;
    setVerifying(true);
    try {
      const r = await getGoLiveTestSession({ data: { sessionId: record.sessionId, environment: env } });
      if ("error" in r) throw new Error(r.error);
      const rec: TestRecord = {
        ...record,
        status: r.status,
        paymentStatus: r.paymentStatus,
        amountTotal: r.amountTotal,
        currency: r.currency,
        paymentIntentId: r.paymentIntentId,
        chargeId: r.chargeId,
        receiptUrl: r.receiptUrl,
        last4: r.last4,
        brand: r.brand,
        stripeStatementDescriptor: r.statementDescriptor ?? record.stripeStatementDescriptor,
      };
      saveRecord(rec);
      setRecord(rec);
      toast.success("Refreshed from Stripe.");
    } catch (e: any) {
      toast.error(e?.message ?? "Refresh failed");
    } finally { setVerifying(false); }
  };

  const startCheckout = async () => {
    if (!user) { toast.info("Sign in to run the test."); navigate({ to: "/auth" }); return; }
    if (!env) { toast.error("Stripe is not configured."); return; }
    const cents = Math.round(parseFloat(amountUsd || "0") * 100);
    if (!Number.isFinite(cents) || cents < 50 || cents > 500) {
      toast.error("Enter an amount between $0.50 and $5.00.");
      return;
    }
    setStarting(true);
    try {
      const r = await createGoLiveTestCheckout({
        data: {
          amountInCents: cents,
          environment: env,
          returnUrl: `${window.location.origin}/go-live-test?session_id={CHECKOUT_SESSION_ID}`,
        },
      });
      if ("error" in r) throw new Error(r.error);
      if (!r.clientSecret) throw new Error("No client secret returned");
      // Seed a pending record so we remember the amount attempted.
      const pending: TestRecord = {
        sessionId: r.sessionId ?? "pending",
        environment: env,
        amountCents: cents,
        createdAt: new Date().toISOString(),
        status: "open",
        paymentStatus: "unpaid",
        amountTotal: cents,
        currency: "usd",
        paymentIntentId: null,
        chargeId: null,
        receiptUrl: null,
        last4: null,
        brand: null,
        stripeStatementDescriptor: null,
      };
      saveRecord(pending);
      setRecord(pending);
      setClientSecret(r.clientSecret);
    } catch (e: any) {
      toast.error(e?.message ?? "Could not start checkout");
    } finally { setStarting(false); }
  };

  const confirmDescriptor = () => {
    if (!record) return;
    const trimmed = observed.trim();
    const stripe = (record.stripeStatementDescriptor ?? "").trim().toUpperCase();
    let match: TestRecord["descriptorMatch"] = "unknown";
    if (trimmed && stripe) match = stripe.includes(trimmed.toUpperCase()) || trimmed.toUpperCase().includes(stripe) ? "match" : "mismatch";
    const rec: TestRecord = {
      ...record,
      observedStatementDescriptor: trimmed || null,
      descriptorMatch: match,
      notes: notes.trim() || undefined,
      confirmedAt: new Date().toISOString(),
    };
    saveRecord(rec);
    setRecord(rec);
    toast.success("Test recorded.");
  };

  const resetAll = () => {
    saveRecord(null);
    setRecord(null);
    setClientSecret(null);
    setSessionId(null);
    setObserved(""); setNotes("");
  };

  const downloadJson = () => {
    if (!record) return;
    const blob = new Blob([JSON.stringify(record, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `pumppilot-golive-test-${record.sessionId}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const step: 1 | 2 | 3 | 4 = clientSecret ? 2 : !record ? 1 : !record.chargeId && !record.paymentIntentId ? 2 : !record.confirmedAt ? 3 : 4;

  return (
    <AppShell>
      <PaymentTestModeBanner />
      <div className="mx-auto max-w-3xl py-6 space-y-6">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/pricing" })}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Back
          </Button>
          <div className="ml-auto flex items-center gap-2">
            <Badge variant="outline" className={isLive ? "border-emerald-500/30 text-emerald-300" : "border-orange-500/40 text-orange-300"}>
              {env ? env.toUpperCase() : "NO ENV"}
            </Badge>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-emerald-400" />
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Go-Live Payment Test</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Runs a single small charge end-to-end so you can verify checkout, receipt delivery, and the exact statement descriptor your customers will see on their bank statement.
          </p>
        </div>

        {!isLive && (
          <Card className="p-4 border-orange-500/40 bg-orange-500/5 flex gap-3 text-sm">
            <AlertTriangle className="h-5 w-5 text-orange-400 shrink-0" />
            <div>
              <div className="font-medium text-orange-200">You're in sandbox mode</div>
              <div className="text-muted-foreground">This flow works in sandbox with Stripe test cards (e.g. 4242 4242 4242 4242), but statement descriptors only reach a real bank statement when running in live mode.</div>
            </div>
          </Card>
        )}

        <Stepper step={step} />

        {step === 1 && (
          <Card className="p-6 space-y-4">
            <div>
              <h2 className="text-lg font-semibold">Step 1 — Start the test charge</h2>
              <p className="text-sm text-muted-foreground">Use a real card you own. We recommend $1.00. You can refund it from your Stripe dashboard afterwards.</p>
            </div>
            <div className="flex items-end gap-3">
              <div className="w-32">
                <Label htmlFor="amt">Amount (USD)</Label>
                <Input id="amt" inputMode="decimal" value={amountUsd} onChange={(e) => setAmountUsd(e.target.value)} />
              </div>
              <Button onClick={startCheckout} disabled={starting}>
                {starting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ArrowRight className="mr-2 h-4 w-4" />}
                Launch checkout
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">Between $0.50 and $5.00. Charge is one-off, not a subscription.</p>
          </Card>
        )}

        {clientSecret && (
          <Card className="p-2 md:p-4">
            <EmbeddedCheckoutProvider stripe={getStripe()} options={{ fetchClientSecret: async () => clientSecret }}>
              <EmbeddedCheckout />
            </EmbeddedCheckoutProvider>
          </Card>
        )}

        {step === 3 && record && (
          <Card className="p-6 space-y-5">
            <div>
              <h2 className="text-lg font-semibold">Step 2 — Verify the statement descriptor</h2>
              <p className="text-sm text-muted-foreground">Open your banking app or card statement (may take a few minutes to appear) and copy the descriptor exactly as shown.</p>
            </div>

            <ReceiptSummary record={record} onRefresh={refreshSession} refreshing={verifying} />

            <Separator />

            <div className="grid gap-3">
              <div>
                <Label htmlFor="obs">Descriptor shown on the bank/card statement</Label>
                <Input
                  id="obs"
                  placeholder="e.g. LINK.COM* PUMP PILOT AI"
                  value={observed}
                  onChange={(e) => setObserved(e.target.value)}
                />
                {record.stripeStatementDescriptor && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Stripe reported: <span className="font-mono">{record.stripeStatementDescriptor}</span>
                  </p>
                )}
              </div>
              <div>
                <Label htmlFor="notes">Notes (optional)</Label>
                <Textarea id="notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything unexpected? Timing, wording, currency…" />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button onClick={confirmDescriptor}>
                  <CheckCircle2 className="mr-2 h-4 w-4" /> Save test record
                </Button>
                <Button variant="outline" onClick={refreshSession} disabled={verifying}>
                  {verifying ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Refresh from Stripe
                </Button>
              </div>
            </div>
          </Card>
        )}

        {step === 4 && record && (
          <Card className="p-6 space-y-5">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-400" />
              <h2 className="text-lg font-semibold">Test complete</h2>
              {record.descriptorMatch === "match" && <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30 border">Descriptor matches</Badge>}
              {record.descriptorMatch === "mismatch" && <Badge className="bg-red-500/20 text-red-300 border-red-500/30 border">Descriptor mismatch</Badge>}
              {record.descriptorMatch === "unknown" && <Badge variant="outline">Descriptor unverified</Badge>}
            </div>

            <ReceiptSummary record={record} onRefresh={refreshSession} refreshing={verifying} />

            <div className="grid gap-2 text-sm">
              <Row label="Observed descriptor" value={record.observedStatementDescriptor || "—"} mono />
              <Row label="Stripe descriptor" value={record.stripeStatementDescriptor || "—"} mono />
              <Row label="Confirmed at" value={record.confirmedAt ? new Date(record.confirmedAt).toLocaleString() : "—"} />
              {record.notes && <Row label="Notes" value={record.notes} />}
            </div>

            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={downloadJson}>
                <ClipboardCopy className="mr-2 h-4 w-4" /> Download record (JSON)
              </Button>
              {record.receiptUrl && (
                <Button variant="outline" asChild>
                  <a href={record.receiptUrl} target="_blank" rel="noopener noreferrer">
                    View Stripe receipt <ExternalLink className="ml-2 h-3.5 w-3.5" />
                  </a>
                </Button>
              )}
              <Button variant="ghost" onClick={resetAll}>Run another test</Button>
            </div>
          </Card>
        )}

        {sessionId && !clientSecret && step === 2 && (
          <Card className="p-6 flex items-center gap-2 text-sm">
            <Loader2 className="h-4 w-4 animate-spin" /> Recording your payment…
          </Card>
        )}
      </div>
    </AppShell>
  );
}

function Stepper({ step }: { step: 1 | 2 | 3 | 4 }) {
  const items = [
    { n: 1, label: "Start charge" },
    { n: 2, label: "Pay in checkout" },
    { n: 3, label: "Verify descriptor" },
    { n: 4, label: "Recorded" },
  ];
  return (
    <div className="flex items-center gap-2 text-xs">
      {items.map((it, i) => (
        <div key={it.n} className="flex items-center gap-2">
          <div className={`grid h-6 w-6 place-items-center rounded-full border ${step >= (it.n as 1|2|3|4) ? "border-emerald-500/60 bg-emerald-500/20 text-emerald-200" : "border-border text-muted-foreground"}`}>
            {step > it.n ? <CheckCircle2 className="h-3.5 w-3.5" /> : it.n}
          </div>
          <span className={step >= (it.n as 1|2|3|4) ? "text-foreground" : "text-muted-foreground"}>{it.label}</span>
          {i < items.length - 1 && <div className="w-6 h-px bg-border mx-1" />}
        </div>
      ))}
    </div>
  );
}

function ReceiptSummary({ record, onRefresh, refreshing }: { record: TestRecord; onRefresh: () => void; refreshing: boolean }) {
  return (
    <div className="grid sm:grid-cols-2 gap-3 text-sm">
      <Row label="Amount" value={currency(record.amountTotal ?? record.amountCents, record.currency ?? "usd")} />
      <Row label="Payment status" value={record.paymentStatus ?? "—"} badge />
      <Row label="Session" value={record.sessionId} mono truncate />
      <Row label="PaymentIntent" value={record.paymentIntentId ?? "—"} mono truncate />
      <Row label="Charge" value={record.chargeId ?? "—"} mono truncate />
      <Row label="Card" value={record.brand && record.last4 ? `${record.brand.toUpperCase()} •••• ${record.last4}` : "—"} />
      <div className="sm:col-span-2 -mt-1">
        <Button size="sm" variant="ghost" onClick={onRefresh} disabled={refreshing}>
          {refreshing ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : null}
          Refresh from Stripe
        </Button>
      </div>
    </div>
  );
}

function Row({ label, value, mono, truncate, badge }: { label: string; value: string; mono?: boolean; truncate?: boolean; badge?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-border/60 bg-muted/10 px-3 py-2">
      <span className="text-xs uppercase tracking-wider text-muted-foreground">{label}</span>
      {badge ? (
        <Badge variant="outline" className={value === "paid" ? "border-emerald-500/40 text-emerald-300" : ""}>{value}</Badge>
      ) : (
        <span className={`text-sm ${mono ? "font-mono" : ""} ${truncate ? "truncate max-w-[60%]" : ""}`}>{value}</span>
      )}
    </div>
  );
}
