import { withSocialMeta } from "@/lib/social-meta";
import { createFileRoute, Link } from "@tanstack/react-router";
import { BLOG_POSTS } from "@/lib/blog-posts";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, BookOpen } from "lucide-react";
import {
  SITE_URL,
  ORG_ID,
  WEBSITE_ID,
  breadcrumbSchema,
  blogPostingSchema,
  ldScript,
  nodeId,
  NODE,
} from "@/lib/structured-data";


const CANONICAL = `${SITE_URL}/blog`;

export const Route = createFileRoute("/blog/")({
  head: () => ({
    meta: withSocialMeta([
      { title: "PumpPilot AI Blog — AI Investment & Crypto Trading Guides" },
      { name: "description", content: "Deep guides on AI investment apps, crypto momentum trading, paper trading strategies, and risk-first portfolio management from the PumpPilot AI team." },
      { name: "keywords", content: "ai investment blog, ai crypto trading, best ai investment app, paper trading, momentum signals" },
      { property: "og:title", content: "PumpPilot AI Blog — AI Investment & Crypto Trading Guides" },
      { property: "og:description", content: "Deep guides on AI investment apps, crypto momentum trading, paper trading strategies, and risk-first portfolio management." },
      { property: "og:type", content: "website" },
      { property: "og:url", content: CANONICAL },
      { name: "twitter:card", content: "summary_large_image" },
    ]),
    links: [{ rel: "canonical", href: CANONICAL }],
    scripts: [
      ldScript({
        "@context": "https://schema.org",
        "@type": "Blog",
        "@id": nodeId("/blog", NODE.blog),
        name: "PumpPilot AI Blog",
        url: CANONICAL,
        description: "AI investment and crypto trading guides.",
        inLanguage: "en",
        isPartOf: { "@id": WEBSITE_ID },
        publisher: { "@id": ORG_ID },
        blogPost: BLOG_POSTS.map((p) => blogPostingSchema(p)),

      }),
      ldScript(breadcrumbSchema([{ name: "Blog", path: "/blog" }])),
    ],
  }),
  component: BlogIndex,
});


function BlogIndex() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/50 bg-card/30">
        <div className="mx-auto max-w-5xl px-6 py-16">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <BookOpen className="h-4 w-4" />
            <span>PumpPilot AI Blog</span>
          </div>
          <h1 className="mt-3 text-4xl font-bold tracking-tight md:text-5xl">
            AI Investment & Crypto Trading, Explained
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-muted-foreground">
            Practical guides on the best AI investment apps, momentum signals, paper trading, and risk-first portfolio management.
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-12">
        <div className="grid gap-6 md:grid-cols-2">
          {BLOG_POSTS.map((post) => (
            <Link
              key={post.slug}
              to="/blog/$slug"
              params={{ slug: post.slug }}
              className="group"
            >
              <Card className="h-full transition-all hover:border-primary/50 hover:shadow-lg">
                <CardHeader>
                  <div className="flex items-center gap-2">
                    {post.tags.map((t) => (
                      <Badge key={t} variant="secondary" className="text-xs">{t}</Badge>
                    ))}
                    <span className="ml-auto text-xs text-muted-foreground">{post.readMinutes} min read</span>
                  </div>
                  <CardTitle className="mt-2 text-xl group-hover:text-primary">{post.title}</CardTitle>
                  <CardDescription className="line-clamp-3">{post.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">
                      {new Date(post.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </span>
                    <span className="flex items-center gap-1 font-medium text-primary">
                      Read <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                    </span>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>

        <div className="mt-16 rounded-2xl border border-border/50 bg-card/30 p-8 text-center">
          <h2 className="text-2xl font-semibold">Ready to try the AI Copilot?</h2>
          <p className="mt-2 text-muted-foreground">Paper trade risk-free, then upgrade when you're ready.</p>
          <Link
            to="/pricing"
            className="mt-4 inline-flex items-center gap-2 rounded-md bg-primary px-6 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            View pricing <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </main>
    </div>
  );
}
