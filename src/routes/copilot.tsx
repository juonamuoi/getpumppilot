import { createFileRoute } from "@tanstack/react-router";
import { PaywallGate } from "@/components/paywall-gate";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";
import { askCopilot } from "@/lib/copilot.functions";
import { usePaper } from "@/lib/paper-store";
import { getAsset, fmtUsd, fmtPct } from "@/lib/mock-data";
import { Sparkles, Send, Loader2, Bot } from "lucide-react";

export const Route = createFileRoute("/copilot")({
  head: () => ({
    meta: [
      { title: "AI Copilot — PumpPilot AI" },
      { name: "description", content: "Chat with an AI investing coach about your portfolio, strategy and market signals. Educational only." },
      { property: "og:title", content: "PumpPilot AI Copilot" },
      { property: "og:description", content: "Ask your investing coach anything — plain English, cautious answers." },
    ],
  }),
  component: GatedCopilotPage,
});

type Msg = { role: "user" | "assistant"; content: string };

const SUGGESTIONS = [
  "Explain my portfolio like I'm new to crypto",
  "Which position looks riskiest right now?",
  "Give me a beginner-friendly momentum strategy",
  "What's a healthy stop-loss for volatile tokens?",
  "How do I know when to take profit?",
  "Summarize what changed in the last 24 hours",
];

function CopilotPage() {
  const { positions, cash, equity } = usePaper();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);

  function buildCtx() {
    const lines = positions.map((p) => {
      const a = getAsset(p.symbol);
      if (!a) return "";
      const value = a.price * p.qty;
      const pct = equity > 0 ? (value / equity) * 100 : 0;
      const pnl = (a.price - p.avgCost) * p.qty;
      const pnlPct = ((a.price - p.avgCost) / p.avgCost) * 100;
      return `- ${a.symbol}${a.isDemo ? " [DEMO]" : ""}: ${p.qty} @ avg ${fmtUsd(p.avgCost)}, now ${fmtUsd(a.price)} (${pct.toFixed(1)}% of equity), P/L ${fmtUsd(pnl)} (${fmtPct(pnlPct)}), momentum ${a.momentum.total}, vol ${a.momentum.volatility}, 24h ${fmtPct(a.change24h)}`;
    });
    return `Paper portfolio (DEMO data). Equity ${fmtUsd(equity)}, cash ${fmtUsd(cash)}.\nPositions:\n${lines.join("\n") || "(none)"}`;
  }

  async function send(text?: string) {
    const q = (text ?? input).trim();
    if (!q || busy) return;
    setInput("");
    setMsgs((m) => [...m, { role: "user", content: q }]);
    setBusy(true);
    try {
      const res = await askCopilot({ data: { prompt: `${buildCtx()}\n\nUser: ${q}` } });
      const reply = res.ok ? res.content : `⚠️ ${res.error}`;
      setMsgs((m) => [...m, { role: "assistant", content: reply || "(no response)" }]);
    } catch (e) {
      setMsgs((m) => [...m, { role: "assistant", content: `⚠️ ${e instanceof Error ? e.message : "Failed"}` }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl space-y-4">
        <div>
          <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-emerald-300">
            <Sparkles className="h-3.5 w-3.5" /> AI Copilot
          </div>
          <h1 className="mt-1 text-2xl font-bold sm:text-3xl">Your investing coach</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Ask about your portfolio, tune your strategy, or learn a concept. Educational only — not financial advice.
          </p>
        </div>

        <Card className="border-border/60 bg-card/60">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Bot className="h-4 w-4 text-emerald-400" /> Conversation
            </CardTitle>
            <Badge variant="outline" className="border-emerald-500/30 text-emerald-300">Demo data</Badge>
          </CardHeader>
          <CardContent className="space-y-3">
            {msgs.length === 0 ? (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">Suggestions:</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {SUGGESTIONS.map((s) => (
                    <Button
                      key={s}
                      variant="outline"
                      className="h-auto justify-start whitespace-normal border-border/60 py-2 text-left text-xs"
                      onClick={() => send(s)}
                      disabled={busy}
                    >
                      <Sparkles className="mr-2 h-3.5 w-3.5 shrink-0 text-emerald-400" />
                      {s}
                    </Button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="max-h-[55vh] space-y-3 overflow-y-auto pr-1">
                {msgs.map((m, i) => (
                  <div
                    key={i}
                    className={
                      m.role === "user"
                        ? "ml-auto max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-3 py-2 text-sm text-primary-foreground"
                        : "max-w-[95%] rounded-2xl rounded-bl-sm border border-border/60 bg-muted/30 px-3 py-2 text-sm"
                    }
                  >
                    <div className="whitespace-pre-wrap leading-relaxed">{m.content}</div>
                  </div>
                ))}
                {busy && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Thinking...
                  </div>
                )}
              </div>
            )}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                send();
              }}
              className="flex items-end gap-2 border-t border-border/60 pt-3"
            >
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask anything about investing, your portfolio, or a strategy..."
                rows={2}
                className="min-h-0 resize-none bg-muted/30 text-sm"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
              />
              <Button type="submit" size="icon" disabled={busy || !input.trim()} aria-label="Send">
                <Send className="h-4 w-4" />
              </Button>
            </form>
            <p className="text-[10px] text-muted-foreground">
              Predictions are probabilistic. Returns are not guaranteed. You can lose all capital in real markets.
            </p>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}

function GatedCopilotPage() {
  return (
    <PaywallGate required="pro" featureName="Copilot">
      <CopilotPage />
    </PaywallGate>
  );
}
