import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Radar,
  Bell,
  Wallet,
  FlaskConical,
  History,
  ShieldCheck,
  Menu,
  Lock,
  Sparkles,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { WalletConnect } from "./wallet-connect";
import { cn } from "@/lib/utils";

const nav = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/scanner", label: "Scanner", icon: Radar },
  { to: "/alerts", label: "Alerts", icon: Bell },
  { to: "/paper", label: "Paper Trading", icon: Wallet },
  { to: "/strategy", label: "Strategy Builder", icon: Sparkles },
  { to: "/backtest", label: "Backtest", icon: History },
  { to: "/risk", label: "Risk Controls", icon: ShieldCheck },
] as const;

function Brand() {
  return (
    <div className="flex items-center gap-2">
      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-emerald-400 to-cyan-500 text-black shadow-lg shadow-emerald-500/20">
        <FlaskConical className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <div className="truncate text-sm font-bold tracking-tight">PumpPilot AI</div>
        <div className="truncate text-[10px] uppercase tracking-widest text-muted-foreground">
          Paper mode
        </div>
      </div>
    </div>
  );
}

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <nav className="flex flex-col gap-1">
      {nav.map((n) => {
        const active = n.to === "/" ? pathname === "/" : pathname.startsWith(n.to);
        const Icon = n.icon;
        return (
          <Link
            key={n.to}
            to={n.to}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
              active
                ? "bg-emerald-500/10 text-emerald-300 ring-1 ring-emerald-500/20"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span className="truncate">{n.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

function LiveLockedCard() {
  return (
    <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3">
      <div className="flex items-center gap-2 text-xs font-semibold text-amber-300">
        <Lock className="h-3.5 w-3.5" /> Live execution locked
      </div>
      <p className="mt-1 text-[11px] leading-relaxed text-amber-200/70">
        Master switch is OFF. Only paper trading is available in this build.
      </p>
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Sidebar (desktop) */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-border/60 bg-card/40 backdrop-blur lg:flex">
        <div className="p-4">
          <Brand />
        </div>
        <div className="px-3">
          <WalletConnect />
        </div>
        <div className="mt-4 flex-1 overflow-y-auto px-3">
          <NavList />
        </div>
        <div className="p-3">
          <LiveLockedCard />
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex items-center justify-between gap-2 border-b border-border/60 bg-background/80 px-4 py-3 backdrop-blur lg:hidden">
        <Brand />
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="border-emerald-500/30 text-emerald-300">
            Paper
          </Badge>
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 bg-card/95 p-0">
              <SheetTitle className="sr-only">Navigation</SheetTitle>
              <div className="p-4">
                <Brand />
              </div>
              <div className="px-3">
                <WalletConnect />
              </div>
              <div className="mt-4 px-3">
                <NavList onNavigate={() => setOpen(false)} />
              </div>
              <div className="p-3">
                <LiveLockedCard />
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </header>

      <main className="lg:ml-64">
        <div className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">{children}</div>
      </main>
    </div>
  );
}
