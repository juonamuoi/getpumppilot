import { useState } from "react";
import { Sheet, SheetContent, SheetTrigger, SheetTitle, SheetHeader, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { askCopilot } from "@/lib/copilot.functions";
import { usePaper } from "@/lib/paper-store";
import { getAsset, fmtUsd, fmtPct } from "@/lib/mock-data";
import { Bot, Sparkles, Send, Loader2 } from "lucide-react";

type Msg = { role: "user" | "assistant"; content: string };

function usePortfolioContext() {
  const { positions, cash, equity } = usePaper();
  const lines = positions.map((p) => {
    const a = getAsset(p.symbol);
    if (!a) return "";
    const value = a.price * p.qty;
    const pct = equity > 0 ? (value / equity) * 100 : 0;
    const pnl = (a.price - p.avgCost) * p.qty;
    const pnlPct = ((a.price - p.avgCost) / p.avgCost) * 100;
    return `- ${a.symbol} (${a.name})${a.isDemo ? " [DEMO]" : ""}: ${p.qty} @ avg ${fmtUsd(p.avgCost)}, now ${fmtUsd(a.price)}, value ${fmtUsd(value)} (${pct.toFixed(1)}% of equity), P/L ${fmtUsd(pnl)} (${fmtPct(pnlPct)}), momentum ${a.momentum.total}/100, vol ${a.momentum.volatility}/100, 24h ${fmtPct(a.change24h)}`;
  });
  return `Paper portfolio snapshot (DEMO data):\nEquity: ${fmtUsd(equity)} · Cash: ${fmtUsd(cash)}\nPositions:\n${lines.join("\n") || "(none)"}`;
}

const QUICK = [
  { label: "Explain my portfolio", prompt: "Explain my portfolio in plain English. What am I most exposed to, and what's my biggest risk right now?" },
  { label: "What should I watch today?", prompt: "Given the assets in my snapshot, which one shows the strongest signal and which one looks most fragile? Keep it under 120 words." },
  { label: "Coach my risk", prompt: "Review my position sizing and risk. What one change would most improve my downside protection?" },
  { label: "Teach me momentum", prompt: "Explain what momentum trading is, when it works, and when it fails. Beginner language, 4 short bullets." },
];

export function AICopilot() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const ctx = usePortfolioContext();

  async function send(promptOverride?: string) {
    const q = (promptOverride ?? input).trim();
    if (!q || busy) return;
    setInput("");
    setMsgs((m) => [...m, { role: "user", content: q }]);
    setBusy(true);
    try {
      const fullPrompt = `${ctx}\n\nUser question: ${q}`;
      const res = await askCopilot({ data: { prompt: fullPrompt } });
      const reply = res.ok ? res.content : `⚠️ ${res.error}`;
      setMsgs((m) => [...m, { role: "assistant", content: reply || "(no response)" }]);
    } catch (e) {
      setMsgs((m) => [
        ...m,
        { role: "assistant", content: `⚠️ ${e instanceof Error ? e.message : "Request failed"}` },
      ]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          size="icon"
          className="fixed bottom-4 right-4 z-40 h-14 w-14 rounded-full bg-gradient-to-br from-emerald-400 to-cyan-500 text-black shadow-xl shadow-emerald-500/30 hover:opacity-90"
          aria-label="Open AI Copilot"
        >
          <Sparkles className="h-6 w-6" />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b border-border/60 p-4">
          <SheetTitle className="flex items-center gap-2 text-base">
            <Bot className="h-4 w-4 text-emerald-400" /> AI Copilot
            <Badge variant="outline" className="ml-auto border-emerald-500/30 text-emerald-300">
              Demo data
            </Badge>
          </SheetTitle>
          <SheetDescription className="text-xs">
            Ask about your portfolio, strategy or the market. Educational only — not financial advice.
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-4">
          {msgs.length === 0 && (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">Try a quick action:</p>
              <div className="grid gap-2">
                {QUICK.map((q) => (
                  <Button
                    key={q.label}
                    variant="outline"
                    className="h-auto justify-start whitespace-normal border-border/60 py-2 text-left text-xs"
                    onClick={() => send(q.prompt)}
                    disabled={busy}
                  >
                    <Sparkles className="mr-2 h-3.5 w-3.5 shrink-0 text-emerald-400" />
                    {q.label}
                  </Button>
                ))}
              </div>
            </div>
          )}
          <div className="space-y-3">
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
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
          className="border-t border-border/60 p-3"
        >
          <div className="flex items-end gap-2">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask anything about your portfolio or the market..."
              rows={2}
              className="min-h-0 resize-none bg-muted/30 text-sm"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
            />
            <Button
              type="submit"
              size="icon"
              disabled={busy || !input.trim()}
              className="shrink-0"
              aria-label="Send message to AI Copilot"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
          <p className="mt-1 text-[10px] text-muted-foreground">
            Educational assistant. Not financial advice. Predictions are probabilistic — you can lose all capital.
          </p>
        </form>
      </SheetContent>
    </Sheet>
  );
}
