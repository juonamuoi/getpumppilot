import { withSocialMeta } from "@/lib/social-meta";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ATOM_PATH, RSS_PATH } from "@/lib/feed";
import { BLOG_POSTS, type BlogPost } from "@/lib/blog-posts";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, BookOpen, ChevronLeft, ChevronRight } from "lucide-react";
import {
  SITE_URL,
  ORG_ID,
  WEBSITE_ID,
  breadcrumbSchema,
  blogPostingSchema,
  authorNodesFor,
  ldScript,
  nodeId,
  NODE,
  SOCIAL_IMAGE,
  SOCIAL_IMAGE_URL,
  canonicalUrl,
} from "@/lib/structured-data";
import {
  paginate,
  paginationLinks,
  paginationTitleSuffix,
  collectionPageSchema,
  paginationChainSchema,
  pagePath,
  type Paged,
} from "@/lib/pagination";


const CANONICAL = `${SITE_URL}/blog`;
const BASE_PATH = "/blog";
const BASE_TITLE = "PumpPilot AI Blog — AI Investment & Crypto Trading Guides";
const BASE_DESCRIPTION =
  "Deep guides on AI investment apps, crypto momentum trading, paper trading strategies, and risk-first portfolio management from the PumpPilot AI team.";

type BlogSearch = { page?: number };

export const Route = createFileRoute("/blog/")({
  validateSearch: (s: Record<string, unknown>): BlogSearch => {
    const n = Number(s.page);
    return Number.isFinite(n) && n > 1 ? { page: Math.trunc(n) } : {};
  },
  // The page number must reach head(), so it travels through the loader.
  loaderDeps: ({ search }) => ({ page: search.page ?? 1 }),
  loader: ({ deps }): { paged: Paged<BlogPost> } => ({ paged: paginate<BlogPost>(BLOG_POSTS, deps.page) }),
  head: ({ loaderData }) => {
    const paged: Paged<BlogPost> = loaderData?.paged ?? paginate<BlogPost>(BLOG_POSTS, 1);
    const suffix = paginationTitleSuffix(paged);
    const title = BASE_TITLE + suffix;
    const description = BASE_DESCRIPTION + (suffix ? ` Page ${paged.page} of ${paged.totalPages}.` : "");
    const selfUrl = canonicalUrl(pagePath(BASE_PATH, paged.page));
    const postUrls = paged.items.map((p) => canonicalUrl(`/blog/${p.slug}`));

    return {
      meta: withSocialMeta([
        { title },
        { name: "description", content: description },
        { name: "keywords", content: "ai investment blog, ai crypto trading, best ai investment app, paper trading, momentum signals" },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        { property: "og:url", content: selfUrl },
        // The index's own card image is the site cover — kept identical to the
        // Blog node's `image` below so JSON-LD and the Twitter card never drift.
        { property: "og:image", content: SOCIAL_IMAGE_URL },
        { property: "og:image:width", content: String(SOCIAL_IMAGE.width) },
        { property: "og:image:height", content: String(SOCIAL_IMAGE.height) },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:image", content: SOCIAL_IMAGE_URL },
      ]),
      // Self-canonical per page plus the rel=prev/next chain.
      links: paginationLinks(BASE_PATH, paged),
      scripts: [
        ldScript({
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "Blog",
              "@id": nodeId("/blog", NODE.blog),
              name: "PumpPilot AI Blog",
              url: CANONICAL,
              description: "AI investment and crypto trading guides.",
              inLanguage: "en",
              image: SOCIAL_IMAGE,
              isPartOf: { "@id": WEBSITE_ID },
              publisher: { "@id": ORG_ID },
              // Only the posts actually rendered on this page.
              blogPost: paged.items.map((p) => blogPostingSchema(p)),
            },
            // The paginated view itself, listing this page's entries.
            collectionPageSchema({
              basePath: BASE_PATH,
              paged,
              id: `${selfUrl}#${NODE.webpage}`,
              name: "PumpPilot AI Blog",
              description: "AI investment and crypto trading guides.",
              itemUrls: postUrls,
              isPartOf: WEBSITE_ID,
              publisher: ORG_ID,
            }),
            // prev/next chain in JSON-LD, mirroring the <link> tags.
            paginationChainSchema(BASE_PATH, paged, "PumpPilot AI Blog"),
            // Author entities referenced by every BlogPosting above.
            ...authorNodesFor(paged.items),
          ],
        }),
        ldScript(breadcrumbSchema([{ name: "Blog", path: "/blog" }])),
      ],
    };
  },
  component: BlogIndex,
});



function BlogIndex() {
  // Explicit annotation: the loader's return type is inferred through the
  // route's own generics, which erases the item type at the use site.
  const { paged } = Route.useLoaderData() as { paged: Paged<BlogPost> };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/50 bg-card/30">
        <div className="mx-auto max-w-5xl px-6 py-16">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <BookOpen className="h-4 w-4" />
            <span>PumpPilot AI Blog</span>
          </div>
          <h1 className="mt-3 text-4xl font-bold tracking-tight md:text-5xl">
            AI Investment &amp; Crypto Trading, Explained
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-muted-foreground">
            Practical guides on the best AI investment apps, momentum signals, paper trading, and risk-first portfolio management.
          </p>
          {paged.totalPages > 1 && (
            <p className="mt-2 text-sm text-muted-foreground">
              Page {paged.page} of {paged.totalPages} · {paged.totalItems} articles
            </p>
          )}
          <p className="mt-4 text-sm text-muted-foreground">
            Subscribe:{" "}
            <a href={RSS_PATH} className="underline hover:text-foreground">RSS feed</a>{" "}
            ·{" "}
            <a href={ATOM_PATH} className="underline hover:text-foreground">Atom feed</a>
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-12">
        <div className="grid gap-6 md:grid-cols-2">
          {paged.items.map((post) => (
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

        {paged.totalPages > 1 && (
          // Real crawlable <a> links (not JS-only controls) so every page of
          // the series is discoverable from page 1.
          <nav className="mt-12 flex items-center justify-between gap-4" aria-label="Blog pagination">
            {paged.hasPrev ? (
              <Link
                to="/blog"
                search={paged.page - 1 > 1 ? { page: paged.page - 1 } : {}}
                rel="prev"
                className="inline-flex items-center gap-2 rounded-md border border-border/60 px-4 py-2 text-sm font-medium hover:border-primary/50 hover:text-primary"
              >
                <ChevronLeft className="h-4 w-4" /> Previous
              </Link>
            ) : (
              <span />
            )}

            <ol className="flex items-center gap-2">
              {Array.from({ length: paged.totalPages }, (_, i) => i + 1).map((n) => (
                <li key={n}>
                  <Link
                    to="/blog"
                    search={n > 1 ? { page: n } : {}}
                    aria-current={n === paged.page ? "page" : undefined}
                    className={
                      n === paged.page
                        ? "inline-flex h-9 w-9 items-center justify-center rounded-md bg-primary text-sm font-semibold text-primary-foreground"
                        : "inline-flex h-9 w-9 items-center justify-center rounded-md border border-border/60 text-sm hover:border-primary/50 hover:text-primary"
                    }
                  >
                    {n}
                  </Link>
                </li>
              ))}
            </ol>

            {paged.hasNext ? (
              <Link
                to="/blog"
                search={{ page: paged.page + 1 }}
                rel="next"
                className="inline-flex items-center gap-2 rounded-md border border-border/60 px-4 py-2 text-sm font-medium hover:border-primary/50 hover:text-primary"
              >
                Next <ChevronRight className="h-4 w-4" />
              </Link>
            ) : (
              <span />
            )}
          </nav>
        )}


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
