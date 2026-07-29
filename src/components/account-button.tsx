import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { LogIn, LogOut, User as UserIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-store";

/**
 * Session-aware sign-in / account control.
 * Signed out -> "Sign in" link (preserving the current path as ?next=).
 * Signed in  -> email + sign-out with cache teardown.
 */
export function AccountButton({ onNavigate }: { onNavigate?: () => void }) {
  const { session, user, loading } = useAuth();
  const nav = useNavigate();
  const qc = useQueryClient();
  const path = useRouterState({ select: (s) => s.location.pathname });

  if (loading) {
    return <div className="h-9 rounded-lg border border-border/60 bg-muted/20" />;
  }

  if (!session) {
    return (
      <Button asChild variant="outline" size="sm" className="w-full justify-start gap-2">
        <Link to="/auth" search={{ next: path }} onClick={onNavigate}>
          <LogIn className="h-3.5 w-3.5" /> Sign in
        </Link>
      </Button>
    );
  }

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    const { supabase } = await import("@/integrations/supabase/client");
    await supabase.auth.signOut();
    onNavigate?.();
    nav({ to: "/auth", replace: true });
  }

  return (
    <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-muted/20 px-2.5 py-1.5">
      <UserIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <span className="flex-1 truncate text-[11px] text-muted-foreground">
        {user?.email ?? "Signed in"}
      </span>
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6"
        aria-label="Sign out"
        onClick={signOut}
      >
        <LogOut className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}
