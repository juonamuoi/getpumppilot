// Shows the exact signals behind a token's spam badge, plus allow/block controls.
import { ShieldBan, ShieldCheck, Undo2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { evaluateSpam, type SpamInput } from "@/lib/spam-signals";
import { entryKey, listVerdict, useSpamLists } from "@/lib/spam-lists";

export function SpamSignalsPanel({ holding }: { holding: SpamInput }) {
  const { lists, add, remove } = useSpamLists();
  const verdict = evaluateSpam(holding, lists);
  const listed = listVerdict(lists, holding.address, holding.symbol);
  const key = entryKey(holding.address, holding.symbol);

  const eligible = Boolean(holding.discovered) && holding.kind === "erc20";
  if (!eligible && !listed) return null;

  const setList = (kind: "allow" | "block") => {
    add(kind, { key, label: holding.symbol || key });
    toast.success(kind === "allow" ? `${holding.symbol} marked as trusted` : `${holding.symbol} blocklisted`);
  };

  return (
    <div className="mt-4">
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Spam signals
        </h4>
        <Badge
          variant="outline"
          className={`text-[9px] uppercase ${
            verdict.spam ? "border-rose-500/40 text-rose-300" : "border-emerald-500/40 text-emerald-300"
          }`}
        >
          {verdict.spam ? "spam-likely" : "not flagged"}
        </Badge>
        <Badge variant="outline" className="border-border/60 text-[9px] uppercase">
          score {verdict.score}/{verdict.threshold}
        </Badge>
        {verdict.source !== "heuristic" && (
          <Badge variant="outline" className="border-sky-500/40 text-[9px] uppercase text-sky-300">
            {verdict.source === "allow" + "list" ? "your allowlist" : "your blocklist"}
          </Badge>
        )}
      </div>

      {verdict.source !== "heuristic" && verdict.heuristicSpam !== verdict.spam && (
        <p className="mb-2 text-[11px] text-amber-300">
          Your {verdict.source} overrides the automatic result
          {verdict.heuristicSpam ? " (the heuristic would flag this token)." : " (the heuristic would not flag this token)."}
        </p>
      )}

      {verdict.signals.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No spam signals detected for this token.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {verdict.signals.map((s) => (
            <li
              key={s.id}
              className="rounded-md border border-border/60 bg-muted/20 px-2 py-1.5 text-xs"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold">{s.label}</span>
                <Badge variant="outline" className="border-border/60 text-[9px]">
                  +{s.weight}
                </Badge>
              </div>
              <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">{s.detail}</p>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-2 flex flex-wrap gap-2">
        {listed ? (
          <Button variant="outline" size="sm" onClick={() => remove(key)}>
            <Undo2 className="mr-1.5 h-3.5 w-3.5" /> Remove from {listed}list
          </Button>
        ) : (
          <>
            <Button variant="outline" size="sm" onClick={() => setList("allow")}>
              <ShieldCheck className="mr-1.5 h-3.5 w-3.5 text-emerald-400" /> Mark as trusted
            </Button>
            <Button variant="outline" size="sm" onClick={() => setList("block")}>
              <ShieldBan className="mr-1.5 h-3.5 w-3.5 text-rose-400" /> Always treat as spam
            </Button>
          </>
        )}
      </div>
      <p className="mt-1 text-[10px] text-muted-foreground">
        Heuristic scoring only — never authoritative. Always verify the contract before
        interacting with any token.
      </p>
    </div>
  );
}
