import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Check,
  Lock,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { useAuth } from "@/lib/auth-store";
import {
  assignCreative,
  trackCreativeEvent,
  type AdCreative,
  type Assignment,
} from "@/lib/ad-creatives";
import { trackCtaClick } from "@/lib/funnel";
import { readUtmSourceMedium, tailorCopy, type TailoredCopy } from "@/lib/utm-copy";
import {
  COMPLIANCE_FOOTER,
  getVariant,
  LANDING_VARIANTS,
} from "@/lib/landing-variants";

const SITE_URL = "https://crypto-spotter-pro.lovable.app";

export const Route = createFileRoute("/lp/$variant")({
  loader: ({ params }) => {
    const variant = getVariant(params.variant);
    if (!variant) throw notFound();
    return { slug: variant.slug };
  },
  head: ({ params }) => {
    const v = getVariant(params.variant) ?? LANDING_VARIANTS[0];
    const url = `${SITE_URL}/lp/${v.slug}`;
    return {
      meta: [
        { title: v.metaTitle },
        { name: "description", content: v.metaDescription },
        { name: "robots", content: "noindex, follow" },
        { property: "og:title", content: v.metaTitle },
        { property: "og:description", content: v.metaDescription },
        { property: "og:type", content: "website" },
        { property: "og:url", content: url },
        { property: "og:image", content: `${SITE_URL}/favicon.png` },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: v.metaTitle },
        { name: "twitter:description", content: v.metaDescription },
        { name: "twitter:image", content: `${SITE_URL}/favicon.png` },
      ],
      links: [{ rel: "canonical", href: SITE_URL }],
    };
  },
  component: AdLandingVariant,
});

function AdLandingVariant() {
  const params = Route.useParams();
  const v = getVariant(params.variant) ?? LANDING_VARIANTS[0];
  const { user } = useAuth();

  useEffect(() => {
    document.documentElement.classList.add("dark");
  }, []);

  // Channel-tailored copy: resolved after mount so SSR keeps the base variant.
  const [copy, setCopy] = useState<TailoredCopy>(() =>
    tailorCopy(v, { source: null, medium: null }),
  );
  useEffect(() => {
    setCopy(tailorCopy(v, readUtmSourceMedium()));
  }, [v]);

  const [creative, setCreative] = useState<AdCreative | null>(null);
  const assignmentRef = useRef<Assignment | null>(null);

  // Assign an ad creative, persist attribution and log the impression.
  useEffect(() => {
    const { creative: c, assignment } = assignCreative(v.slug);
    assignmentRef.current = assignment;
    setCreative(c);
    void trackCreativeEvent("impression", assignment);
  }, [v.slug]);

  const trackClick = (placement: string) => () => {
    if (assignmentRef.current) void trackCreativeEvent("click", assignmentRef.current);
    void trackCtaClick(placement, v.slug);
  };

  const ctaHref = user ? "/dashboard" : "/auth";
  const ctaLabel = user ? "Launch dashboard" : creative?.cta ?? copy.ctaPrimary;

  const Cta = ({ size = "lg" }: { size?: "lg" | "default" }) => (
    <div className="flex flex-col items-center gap-3">
      <div className="flex flex-wrap items-center justify-center gap-3">
        <Button size={size} asChild onClick={trackClick(size === "lg" ? "hero" : "inline")}>
          <Link to={ctaHref}>
            {ctaLabel} <ArrowRight className="ml-2 h-4 w-4" />
          </Link>
        </Button>
        <Button variant="outline" size={size} asChild>
          <Link to="/learn">{v.ctaSecondary}</Link>
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Free plan, no card required · Paper trading only
      </p>
    </div>
  );

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border/60 bg-background/80 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <Link to="/" className="flex items-center gap-2">
            <img
              src="/favicon.png"
              alt="PumpPilot AI logo"
              className="h-9 w-9 rounded-xl object-cover"
            />
            <span className="text-sm font-bold tracking-tight">PumpPilot AI</span>
          </Link>
          <Button size="sm" asChild onClick={trackClick("nav")}>
            <Link to={ctaHref}>{ctaLabel}</Link>
          </Button>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="relative overflow-hidden px-4 pt-14 pb-16">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-emerald-500/10 via-transparent to-transparent" />
          <div className="relative mx-auto max-w-3xl text-center">
            <Badge
              variant="outline"
              className="mb-4 border-emerald-500/30 px-3 py-1 text-emerald-300"
            >
              <Sparkles className="mr-1.5 h-3 w-3" /> {copy.badge}
            </Badge>
            <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl">
              {(creative?.headline ?? copy.headline)}{" "}
              <span className="bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
                {creative?.headlineAccent ?? copy.headlineAccent}
              </span>
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-lg text-muted-foreground">
              {creative?.description ?? copy.subhead}
            </p>
            <div className="mt-8">
              <Cta />
            </div>
            <p className="mx-auto mt-5 max-w-2xl rounded-lg border border-border/60 bg-muted/20 px-4 py-3 text-xs leading-relaxed text-muted-foreground">
              <Lock className="mr-1.5 inline h-3 w-3 text-emerald-400" />
              {copy.complianceLine}
            </p>
            {copy.matched && (
              <p className="mt-2 text-[10px] uppercase tracking-wide text-muted-foreground/70">
                Tailored for {copy.matched}
                {copy.medium ? ` · ${copy.medium}` : ""}
              </p>
            )}
            <div className="mt-6 flex flex-wrap items-center justify-center gap-4 text-xs text-muted-foreground">
              {v.proof.map((p) => (
                <span key={p} className="inline-flex items-center gap-1">
                  <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" /> {p}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* Value bullets */}
        <section className="border-y border-border/60 bg-muted/10 px-4 py-14">
          <div className="mx-auto grid max-w-5xl gap-4 md:grid-cols-3">
            {v.bullets.map((b) => (
              <Card key={b.title} className="border-border/60 bg-card/60">
                <CardContent className="p-5">
                  <Check className="h-7 w-7 text-emerald-400" />
                  <h2 className="mt-3 font-semibold">{b.title}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">{b.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* Objection handling */}
        <section className="px-4 py-14">
          <div className="mx-auto max-w-2xl">
            <h2 className="mb-4 text-center text-2xl font-bold tracking-tight">
              Before you sign up
            </h2>
            <Accordion type="single" collapsible>
              {v.objection.map((o, i) => (
                <AccordionItem key={o.q} value={`o-${i}`}>
                  <AccordionTrigger className="text-left text-sm">
                    {o.q}
                  </AccordionTrigger>
                  <AccordionContent className="text-sm text-muted-foreground">
                    {o.a}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </section>

        {/* Closing CTA */}
        <section className="border-t border-border/60 bg-muted/10 px-4 py-16">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
              Spot momentum. Control risk. Trade smarter.
            </h2>
            <p className="mt-3 text-muted-foreground">
              Start on the free plan in under three minutes — everything runs in
              paper mode with mock and demo data.
            </p>
            <div className="mt-7">
              <Cta />
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border/60 px-4 py-10">
        <div className="mx-auto max-w-3xl space-y-4 text-center">
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            {COMPLIANCE_FOOTER}
          </p>
          <div className="flex flex-wrap justify-center gap-4 text-xs text-muted-foreground">
            <Link to="/">Home</Link>
            <Link to="/pricing">Pricing</Link>
            <Link to="/risk-disclosure">Risk disclosure</Link>
            <Link to="/terms">Terms</Link>
            <Link to="/privacy">Privacy</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
