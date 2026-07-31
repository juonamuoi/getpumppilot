import { withSocialMeta } from "@/lib/social-meta";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { ldScript, siteGraph } from "@/lib/structured-data";
import { Toaster } from "sonner";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { hideSplashScreen, setStatusBarDark } from "@/lib/native";
import { PaperProvider } from "@/lib/paper-store";
import { SecurityProvider } from "@/lib/security-store";
import { OnboardingProvider } from "@/lib/onboarding-store";
import { AuthProvider } from "@/lib/auth-store";
import { AppLockProvider, useAppLock } from "@/lib/app-lock";
import { TourProvider } from "@/lib/tour-store";
import { GuidedTour } from "@/components/guided-tour";
import { AppLockScreen } from "@/components/app-lock-screen";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: withSocialMeta([
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      {
        name: "google-site-verification",
        content: "0z-jV2z_Fo8iSNrL331OsmPN763jf0Te_Xq4b6BKAFY",
      },
      { title: "PumpPilot AI — Spot momentum. Control risk. Trade smarter." },
      {
        name: "description",
        content:
          "Premium crypto dashboard with explainable momentum scores, market scanner, paper trading, backtesting and strict risk controls. Demo data only.",
      },
      { name: "author", content: "PumpPilot AI" },
      { property: "og:title", content: "PumpPilot AI — Explainable Crypto Momentum & Paper Trading" },
      {
        property: "og:description",
        content:
          "Spot momentum. Control risk. Trade smarter. Paper-trade crypto with explainable AI signals.",
      },
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: "PumpPilot AI" },
      { name: "twitter:card", content: "summary_large_image" },
    ]),
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.png", type: "image/png" },
      // Feed autodiscovery for the journal (site-wide so every page exposes it).
      {
        rel: "alternate",
        type: "application/rss+xml",
        title: `${FEED_TITLE} — RSS`,
        href: RSS_PATH,
      },
      {
        rel: "alternate",
        type: "application/atom+xml",
        title: `${FEED_TITLE} — Atom`,
        href: ATOM_PATH,
      },
    ],

    // Site-wide Organization + WebSite graph. Page-specific schemas live on
    // their own routes and reference these nodes by @id.
    scripts: [ldScript(siteGraph)],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <HeadContent />
      </head>
      <body className="bg-background text-foreground antialiased">
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function LockGate({ children }: { children: ReactNode }) {
  const { locked } = useAppLock();
  return (
    <>
      {children}
      {locked ? <AppLockScreen /> : null}
    </>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  useEffect(() => {
    void setStatusBarDark();
    void hideSplashScreen();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <SecurityProvider>
          <OnboardingProvider>
            <PaperProvider>
              <AppLockProvider>
                <TourProvider>
                  <LockGate>
                    <Outlet />
                  </LockGate>
                  <GuidedTour />
                </TourProvider>
                <Toaster theme="dark" position="top-right" />
              </AppLockProvider>
            </PaperProvider>
          </OnboardingProvider>
        </SecurityProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

