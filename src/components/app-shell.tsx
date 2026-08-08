import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Radar,
  Bell,
  Wallet,
  History,
  ShieldCheck,
  ShieldAlert,
  KeyRound,
  Menu,
  Lock,
  Sparkles,
  BookOpen,
  Bot,
  Stethoscope,
  LineChart,
  Users,
  Command as CommandIcon,
  Zap,
  Gift,
  Settings as SettingsIcon,
  TerminalSquare,
  Rss,
  Coins,

} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { WalletConnect } from "./wallet-connect";
import { CommandPalette } from "./command-palette";
import { OnboardingDialog } from "./onboarding-dialog";
import { AICopilot } from "./ai-copilot";
import { CreditBadge, CreditMeter } from "./credit-badge";
import { AccountButton } from "./account-button";
import { SeoAlertNotifier } from "./seo-alert-notifier";
import { PositionRiskNotifier } from "./position-risk-notifier";
import { WalletBackupReminder } from "./wallet-backup-reminder";


import { cn } from "@/lib/utils";
import { ATOM_PATH, RSS_PATH } from "@/lib/feed";
import { getPostBySlug } from "@/lib/blog-posts";


const nav = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/scanner", label: "Scanner", icon: Radar },
  { to: "/doctor", label: "Portfolio Doctor", icon: Stethoscope },
  { to: "/copilot", label: "AI Copilot", icon: Bot },
  { to: "/journal", label: "Trade Journal", icon: LineChart },
  { to: "/alerts", label: "Alerts", icon: Bell },
  { to: "/paper", label: "Paper Trading", icon: Wallet },
  { to: "/approvals", label: "Assets & Approvals", icon: KeyRound },
  { to: "/strategy", label: "Strategy Builder", icon: Sparkles },
  { to: "/community", label: "Community", icon: Users },
  { to: "/backtest", label: "Backtest", icon: History },
  { to: "/risk", label: "Risk Controls", icon: ShieldCheck },
  { to: "/security", label: "Security", icon: ShieldAlert },
  { to: "/learn", label: "Learn", icon: BookOpen },
  { to: "/refer", label: "Invite & earn", icon: Gift },
  { to: "/pump", label: "PUMP token", icon: Coins },
  { to: "/pricing", label: "Credits & Pricing", icon: Zap },
  { to: "/mcp-console", label: "MCP Console", icon: TerminalSquare },
  { to: "/settings", label: "Settings", icon: SettingsIcon },
] as const;

/** Comparison guides surfaced in-app so crawlers and users reach them from every page. */
const guideSlugs = [
  "pumppilot-vs-autopilot-comparison",
  "pumppilot-vs-tradingview-paper-trading",
] as const;



function Brand() {
  return (
    <div className="flex items-center gap-2">
      <img
        src="/favicon.png"
        alt="PumpPilot AI logo"
        className="h-9 w-9 shrink-0 rounded-xl object-cover shadow-lg shadow-emerald-500/20"
      />
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
    <nav aria-label="Primary" className="flex flex-col gap-1">
      {nav.map((n) => {
        const active = pathname === n.to || pathname.startsWith(n.to + "/");
        const Icon = n.icon;
        return (
          <Link
            key={n.to}
            to={n.to}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
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

/** Prominent in-app links to the comparison guides + blog index. */
function GuideLinks({ onNavigate }: { onNavigate?: () => void }) {
  const posts = guideSlugs.map((s) => getPostBySlug(s)).filter(Boolean);
  return (
    <div className="rounded-xl border border-border/60 bg-muted/10 p-3">
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
        <BookOpen className="h-3.5 w-3.5 text-emerald-300" aria-hidden /> Guides
      </div>
      <ul aria-label="Guides" className="mt-2 space-y-1.5">
        {posts.map((post) => (
          <li key={post!.slug}>
            <Link
              to="/blog/$slug"
              params={{ slug: post!.slug }}
              onClick={onNavigate}
              className="block text-[11px] leading-snug text-muted-foreground hover:text-foreground"
            >
              {post!.title}
            </Link>
          </li>
        ))}
        <li>
          <Link
            to="/blog"
            onClick={onNavigate}
            className="text-[11px] font-medium text-emerald-300 hover:text-emerald-200"
          >
            All guides →
          </Link>
        </li>
      </ul>
    </div>
  );
}

/** Journal feed autodiscovery links, shown in the sidebar and mobile menu. */

function FeedLinks() {
  return (
    <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
      <Rss className="h-3.5 w-3.5 text-amber-300" aria-hidden />
      <span>Journal feed:</span>
      <a
        href={RSS_PATH}
        className="underline underline-offset-2 hover:text-foreground"
        title="Subscribe to the PumpPilot AI journal via RSS"
      >
        RSS
      </a>
      <span aria-hidden>·</span>
      <a
        href={ATOM_PATH}
        className="underline underline-offset-2 hover:text-foreground"
        title="Subscribe to the PumpPilot AI journal via Atom"
      >
        Atom
      </a>
    </div>
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

/** Announces client-side route changes to screen readers. */
function RouteAnnouncer() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [message, setMessage] = useState("");
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const label =
      nav.find((n) => pathname === n.to || pathname.startsWith(n.to + "/"))?.label ??
      (typeof document !== "undefined" ? document.title : pathname);
    const id = window.setTimeout(() => setMessage(`Navigated to ${label}`), 120);
    return () => window.clearTimeout(id);
  }, [pathname]);
  return (
    <div role="status" aria-live="polite" aria-atomic="true" className="sr-only">
      {message}
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <a
        href="#main-content"
        onClick={(e) => {
          e.preventDefault();
          const main = document.getElementById("main-content");
          main?.focus();
          main?.scrollIntoView({ block: "start" });
        }}
        className="sr-only rounded-md bg-emerald-500 px-4 py-2 text-sm font-semibold text-background focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60]"
      >
        Skip to main content
      </a>
      <RouteAnnouncer />
      <WalletBackupReminder />

      {/* Sidebar (desktop) */}
      <aside aria-label="Sidebar" className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-border/60 bg-card/40 backdrop-blur lg:flex">
        <div className="p-4">
          <Brand />
        </div>
        <div className="px-3">
          <WalletConnect />
        </div>
        <div className="mt-3 px-4">
          <FeedLinks />
        </div>
        <div className="mt-4 flex-1 overflow-y-auto px-3">
          <NavList />
          <div className="mt-3">
            <GuideLinks />
          </div>

        </div>
        <div className="space-y-2 p-3">
          <button
            aria-label="Open quick jump command palette"
            aria-keyshortcuts="Meta+K Control+K"
            onClick={() => {
              // trigger ⌘K
              document.dispatchEvent(
                new KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true }),
              );
            }}
            className="flex w-full items-center gap-2 rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground transition hover:bg-muted/40"
          >
            <CommandIcon className="h-3.5 w-3.5" />
            <span className="flex-1 text-left">Quick jump</span>
            <kbd className="rounded border border-border bg-background px-1.5 py-0.5 font-mono text-[10px]">⌘K</kbd>
          </button>
          <CreditMeter />
          <AccountButton />
          <LiveLockedCard />
        </div>

      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-30 flex items-center justify-between gap-2 border-b border-border/60 bg-background/80 px-4 py-3 backdrop-blur lg:hidden">
        <Brand />
        <div className="flex items-center gap-2">
          <CreditBadge />
          <Badge variant="outline" className="border-emerald-500/30 text-emerald-300">
            Paper
          </Badge>
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Open navigation menu">
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
              <div className="mt-3 px-4">
                <FeedLinks />
              </div>
              <div className="mt-4 px-3">
                <NavList onNavigate={() => setOpen(false)} />
                <div className="mt-3">
                  <GuideLinks onNavigate={() => setOpen(false)} />
                </div>

              </div>
              <div className="space-y-2 p-3">
                <CreditMeter />
                <AccountButton onNavigate={() => setOpen(false)} />
                <LiveLockedCard />
              </div>

            </SheetContent>
          </Sheet>
        </div>
      </header>

      <SeoAlertNotifier />
      <PositionRiskNotifier />


      <main id="main-content" tabIndex={-1} className="lg:ml-64 focus:outline-none">
        <div className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">{children}</div>
      </main>

      <CommandPalette />
      <OnboardingDialog />
      <AICopilot />
    </div>
  );
}
