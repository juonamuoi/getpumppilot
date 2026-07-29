// Public "Developers & Embeds" page — the on-site pitch for anyone
// who might link to us: bloggers, tool aggregators, blockchain explorers.
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Copy, Check, Code2, LinkIcon, Package, ArrowLeft, Zap, Globe } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  SITE_URL as BASE,
  ORG_ID,
  LOGO_URL,
  breadcrumbSchema,
  ldScript,
  nodeId,
  NODE,
} from "@/lib/structured-data";


const IFRAME_SNIPPET = `<iframe
  src="${BASE}/embed/momentum?limit=5&theme=dark"
  width="360" height="320"
  style="border:0;border-radius:12px;overflow:hidden"
  loading="lazy" title="Top crypto momentum by PumpPilot AI"></iframe>
<p><a href="${BASE}?utm_source=embed&utm_medium=widget">Powered by PumpPilot AI</a></p>`;

const BADGE_SNIPPET = `<a href="${BASE}?utm_source=badge" target="_blank" rel="noopener">
  <img src="${BASE}/favicon.png" alt="Analyzed by PumpPilot AI"
       width="120" height="24" style="height:24px" />
</a>`;

const API_SNIPPET = `curl "${BASE}/api/public/momentum?limit=5"

# → { "data": [ { "symbol":"BTC", "momentum":78, ... } ] }`;

export const Route = createFileRoute("/developers")({
  head: () => ({
    meta: [
      { title: "Developers, Widgets & API — PumpPilot AI" },
      {
        name: "description",
        content:
          "Embed PumpPilot AI momentum scores on any site with a free iframe widget, a badge, or the public JSON API. Attribution-friendly.",
      },
      { property: "og:title", content: "PumpPilot AI — Widgets & Public API" },
      {
        property: "og:description",
        content:
          "Free momentum widget, badge, and JSON API. Add live-looking crypto momentum data to any page in seconds.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: `${BASE}/developers` },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: `${BASE}/developers` }],
    scripts: [
      ldScript({
        "@context": "https://schema.org",
        "@type": "WebAPI",
        "@id": nodeId("/developers", NODE.api),
        name: "PumpPilot AI Public Momentum API",
        description:
          "Free JSON API and embeddable iframe widget serving PumpPilot AI crypto momentum scores. Attribution-friendly, no API key required.",
        url: `${BASE}/developers`,
        documentation: `${BASE}/developers`,
        endpointUrl: `${BASE}/api/public/momentum`,
        provider: { "@id": ORG_ID },
        image: LOGO_URL,
        inLanguage: "en",
        isAccessibleForFree: true,
        termsOfService: `${BASE}/terms`,
      }),
      ldScript(breadcrumbSchema([{ name: "Developers", path: "/developers" }])),
    ],
  }),
  component: DevelopersPage,
});

function CopyBlock({ code, id }: { code: string; id: string }) {
  const [copied, setCopied] = useState<string | null>(null);
  return (
    <div className="relative">
      <pre className="overflow-x-auto rounded-lg border border-border/60 bg-muted/30 p-4 text-xs">
        <code>{code}</code>
      </pre>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => {
          navigator.clipboard.writeText(code);
          setCopied(id);
          setTimeout(() => setCopied(null), 1500);
        }}
        className="absolute right-2 top-2 h-7 gap-1 text-xs"
      >
        {copied === id ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
        {copied === id ? "Copied" : "Copy"}
      </Button>
    </div>
  );
}

function DevelopersPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
        <Link
          to="/"
          className="mb-6 inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Back to home
        </Link>

        <div className="mb-8">
          <Badge variant="outline" className="border-emerald-500/30 text-emerald-300">
            Free · Attribution-friendly
          </Badge>
          <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
            Embed PumpPilot AI on any site
          </h1>
          <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
            Add live-looking crypto momentum scores to your blog, dashboard, or explorer in
            seconds. Drop-in <b>iframe widget</b>, a lightweight <b>badge</b>, or hit our public{" "}
            <b>JSON API</b>. All we ask is a link back.
          </p>
        </div>

        <div className="mb-8 grid gap-3 sm:grid-cols-3">
          {[
            { icon: Globe, label: "Iframe widget", desc: "5-line embed, dark/light themes" },
            { icon: Package, label: "Badge", desc: "24px trust badge for tool roundups" },
            { icon: Zap, label: "Public API", desc: "CORS-open JSON, 60s cache" },
          ].map((f) => (
            <Card key={f.label} className="border-border/60 bg-card/60">
              <CardContent className="flex items-start gap-3 p-4">
                <f.icon className="mt-0.5 h-5 w-5 text-emerald-400" />
                <div>
                  <div className="text-sm font-semibold">{f.label}</div>
                  <div className="text-xs text-muted-foreground">{f.desc}</div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Tabs defaultValue="widget" className="space-y-4">
          <TabsList>
            <TabsTrigger value="widget">
              <Globe className="mr-1.5 h-3.5 w-3.5" /> Widget
            </TabsTrigger>
            <TabsTrigger value="badge">
              <Package className="mr-1.5 h-3.5 w-3.5" /> Badge
            </TabsTrigger>
            <TabsTrigger value="api">
              <Code2 className="mr-1.5 h-3.5 w-3.5" /> API
            </TabsTrigger>
          </TabsList>

          <TabsContent value="widget" className="space-y-4">
            <Card className="border-border/60 bg-card/60">
              <CardHeader>
                <CardTitle className="text-base">Live preview</CardTitle>
              </CardHeader>
              <CardContent>
                <iframe
                  src="/embed/momentum?limit=5&theme=dark"
                  width="100%"
                  height="320"
                  className="rounded-lg border border-border/60"
                  title="PumpPilot AI momentum widget preview"
                />
              </CardContent>
            </Card>
            <div>
              <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Paste this on your site
              </div>
              <CopyBlock code={IFRAME_SNIPPET} id="iframe" />
              <p className="mt-2 text-xs text-muted-foreground">
                Params: <code>limit</code> (1–10), <code>theme</code> (dark/light),{" "}
                <code>symbol</code> (single asset).
              </p>
            </div>
          </TabsContent>

          <TabsContent value="badge" className="space-y-4">
            <Card className="border-border/60 bg-card/60">
              <CardContent className="flex items-center justify-center gap-3 p-8">
                <img
                  src="/favicon.png"
                  alt="Analyzed by PumpPilot AI"
                  width={24}
                  height={24}
                  className="h-6 w-6 rounded"
                />
                <span className="text-sm font-semibold">Analyzed by PumpPilot AI</span>
              </CardContent>
            </Card>
            <CopyBlock code={BADGE_SNIPPET} id="badge" />
          </TabsContent>

          <TabsContent value="api" className="space-y-4">
            <CopyBlock code={API_SNIPPET} id="api" />
            <Card className="border-border/60 bg-card/60">
              <CardHeader>
                <CardTitle className="text-sm">Endpoint</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-xs">
                <div>
                  <code className="rounded bg-muted px-1.5 py-0.5">
                    GET {BASE}/api/public/momentum
                  </code>
                </div>
                <ul className="ml-4 list-disc space-y-1 text-muted-foreground">
                  <li>
                    <code>?symbol=BTC</code> — single asset
                  </li>
                  <li>
                    <code>?limit=25</code> — top N by momentum (max 25)
                  </li>
                  <li>CORS: <code>*</code>. Cached 60s. No auth required.</li>
                </ul>
                <p className="pt-2 text-muted-foreground">
                  Attribution: link back to{" "}
                  <a href={BASE} className="text-emerald-400 hover:underline">
                    getpumppilot.app
                  </a>{" "}
                  when using the API in production.
                </p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <div className="mt-10 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-5">
          <div className="flex items-start gap-3">
            <LinkIcon className="mt-0.5 h-5 w-5 text-emerald-400" />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold">Partner program</div>
              <p className="mt-1 text-xs text-muted-foreground">
                Publish a review, roundup or comparison including PumpPilot AI and we'll promote
                your post to our community. Explorers and aggregators get free API rate-limit
                lifts.
              </p>
              <div className="mt-3">
                <a
                  href="mailto:partners@getpumppilot.app?subject=PumpPilot%20AI%20partnership"
                  className="inline-flex items-center gap-2 rounded-md bg-emerald-500/20 px-3 py-1.5 text-xs font-semibold text-emerald-200 hover:bg-emerald-500/30"
                >
                  Email partners@getpumppilot.app
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
