import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
} from "@/components/ui/command";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ASSETS } from "@/lib/mock-data";
import {
  LayoutDashboard,
  Radar,
  Bell,
  Wallet,
  FlaskConical,
  History,
  ShieldCheck,
  ShieldAlert,
  Sparkles,
  BookOpen,
  Coins,
} from "lucide-react";

const NAV_ITEMS = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/scanner", label: "Scanner", icon: Radar },
  { to: "/alerts", label: "Alerts", icon: Bell },
  { to: "/paper", label: "Paper trading", icon: Wallet },
  { to: "/strategy", label: "Strategy builder", icon: FlaskConical },
  { to: "/backtest", label: "Backtest", icon: History },
  { to: "/risk", label: "Risk controls", icon: ShieldCheck },
  { to: "/security", label: "Security", icon: ShieldAlert },
  { to: "/copilot", label: "AI Copilot", icon: Sparkles },
  { to: "/learn", label: "Learn hub", icon: BookOpen },
] as const;

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const nav = useNavigate();

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const go = (to: string, params?: Record<string, string>) => {
    setOpen(false);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    nav({ to: to as any, ...(params ? { params: params as any } : {}) });
  };

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Jump to a page or search assets..." />
      <CommandList>
        <CommandEmpty>No results.</CommandEmpty>
        <CommandGroup heading="Navigate">
          {NAV_ITEMS.map((n) => {
            const Icon = n.icon;
            return (
              <CommandItem key={n.to} onSelect={() => go(n.to)}>
                <Icon className="mr-2 h-4 w-4" />
                {n.label}
              </CommandItem>
            );
          })}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Assets">
          {ASSETS.map((a) => (
            <CommandItem
              key={a.symbol}
              value={`${a.symbol} ${a.name}`}
              onSelect={() => go("/asset/$symbol", { symbol: a.symbol })}
            >
              <Coins className="mr-2 h-4 w-4 text-emerald-400" />
              <span className="font-semibold">{a.symbol}</span>
              <span className="ml-2 text-xs text-muted-foreground">{a.name}</span>
              {a.isDemo && (
                <span className="ml-auto rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] uppercase text-amber-300">
                  Demo
                </span>
              )}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
