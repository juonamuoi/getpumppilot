import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { captureReferralFromUrl, recordReferralIfPresent } from "@/lib/referral";
import { trackSignupOnce } from "@/lib/ad-creatives";
import { captureUtmFromUrl, trackFunnelStep } from "@/lib/funnel";

type Ctx = {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<Ctx>({
  session: null,
  user: null,
  loading: true,
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Capture ?ref= from URL as early as possible.
    captureReferralFromUrl();
    captureUtmFromUrl();
    void trackFunnelStep("visit");

    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      setLoading(false);
      // On sign-in, try to record any pending referral. Defer so RLS/session
      // is fully established.
      if (event === "SIGNED_IN" && s?.user?.id) {
        setTimeout(() => {
          recordReferralIfPresent(s.user.id).catch(() => {});
          trackSignupOnce(s.user.id).catch(() => {});
          trackFunnelStep("signup", s.user.id).catch(() => {});
        }, 0);
      }
    });
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        loading,
        signOut: async () => {
          await supabase.auth.signOut();
        },
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
