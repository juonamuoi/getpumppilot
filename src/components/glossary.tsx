import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { HelpCircle } from "lucide-react";
import type { ReactNode } from "react";

export const GLOSSARY: Record<string, string> = {
  momentum:
    "A 0–100 score of how strongly price is trending up on rising participation. Higher = stronger recent move.",
  volume: "How much of the asset changed hands. Rising volume gives a price move more credibility.",
  volatility:
    "How much the price swings. Higher volatility means bigger potential gains AND bigger potential losses.",
  breakout: "Price pushing above a recent ceiling — often (but not always) a start of a new leg up.",
  drawdown: "The drop from a peak. A 20% drawdown means the account fell 20% from its high.",
  sharpe:
    "Return per unit of risk. Higher is better. Above 1 is decent, above 2 is strong (in backtests).",
  slippage:
    "The difference between the price you expected and the price you got. Worse on illiquid tokens.",
  "stop loss":
    "An automatic exit if the price drops a set % — caps the loss on a trade so one bad idea doesn't blow up the account.",
  "take profit": "An automatic exit if the price rises a set % — locks in gains before the move reverses.",
  "paper trading":
    "Trading with pretend money against real market conditions. Zero risk — a safe way to learn.",
  equity: "The total value of your account: cash plus the current value of every open position.",
};

export function Term({
  k,
  children,
  className = "",
}: {
  k: keyof typeof GLOSSARY | string;
  children?: ReactNode;
  className?: string;
}) {
  const def = GLOSSARY[k as string];
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={`inline-flex items-center gap-1 border-b border-dotted border-muted-foreground/60 cursor-help ${className}`}
          >
            {children ?? k}
            <HelpCircle className="h-3 w-3 opacity-60" />
          </span>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs text-xs leading-relaxed">
          {def ?? "No definition available."}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
