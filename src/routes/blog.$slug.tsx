import { withSocialMeta } from "@/lib/social-meta";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { BLOG_POSTS, getPostBySlug, type BlogBlock } from "@/lib/blog-posts";
import { Badge } from "@/components/ui/badge";
import { PageBreadcrumbs } from "@/components/page-breadcrumbs";
import { ArrowLeft, ArrowRight } from "lucide-react";
import {
  SITE_URL as BASE,
  ORG_ID,
  WEBSITE_ID,

  SOCIAL_IMAGE_URL,
  socialImageUrl,
  breadcrumbSchema,
  blogPostingSchema,
  ldScript,
} from "@/lib/structured-data";

/** Rough word count from the block body — powers Article `wordCount`. */
function countWords(blocks: BlogBlock[]) {
  return blocks.reduce((sum, b) => {
    const text =
      b.type === "ul" ? b.items.join(" ") : "text" in b ? b.text : "";
    return sum + text.trim().split(/\s+/).filter(Boolean).length;
  }, 0);
}

export const Route = createFileRoute("/blog/$slug")({
  loader: ({ params }) => {
    const post = getPostBySlug(params.slug);
    if (!post) throw notFound();
    return { post };
  },
  head: ({ loaderData, params }) => {
    const post = loaderData?.post;
    const url = `${BASE}/blog/${params.slug}`;
    if (!post) return { meta: withSocialMeta([{ title: "Post not found" }]) };
    const imageUrl = post.image ? socialImageUrl(post.image) : SOCIAL_IMAGE_URL;
    const imageAlt = post.imageAlt ?? post.title;
    const socialTitle = `${post.title} | PumpPilot AI`;
    return {
      meta: withSocialMeta([
        { title: `${post.title} — PumpPilot AI` },
        { name: "description", content: post.description },
        { name: "keywords", content: post.keywords.join(", ") },
        { property: "og:title", content: socialTitle },
        { property: "og:description", content: post.description },
        { property: "og:type", content: "article" },
        { property: "og:url", content: url },
        { property: "og:site_name", content: "PumpPilot AI" },
        { property: "og:locale", content: "en_US" },
        { property: "article:published_time", content: post.date },
        { property: "article:modified_time", content: post.date },
        { property: "article:section", content: post.tags[0] ?? "Guides" },
        ...post.tags.map((t) => ({ property: "article:tag", content: t })),
        { property: "og:image", content: imageUrl },
        { property: "og:image:secure_url", content: imageUrl },
        { property: "og:image:type", content: "image/jpeg" },
        { property: "og:image:width", content: "1200" },
        { property: "og:image:height", content: "630" },
        { property: "og:image:alt", content: imageAlt },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:image", content: imageUrl },
        { name: "twitter:image:alt", content: imageAlt },
        { name: "twitter:title", content: socialTitle },
        { name: "twitter:description", content: post.description },
      ]),
      links: [{ rel: "canonical", href: url }],
      scripts: [
        ldScript(
          blogPostingSchema(
            { ...post, wordCount: countWords(post.body) },
            { standalone: true },
          ),
        ),
        ldScript(
          breadcrumbSchema([
            { name: "Blog", path: "/blog" },
            { name: post.title, path: `/blog/${params.slug}` },
          ]),
        ),
      ],
    };
  },

  notFoundComponent: () => (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <h1 className="text-3xl font-bold">Post not found</h1>
        <Link to="/blog" className="mt-4 inline-block text-primary hover:underline">← Back to blog</Link>
      </div>
    </div>
  ),
  errorComponent: ({ error, reset }) => (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <h1 className="text-2xl font-bold">Something went wrong</h1>
        <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
        <button onClick={reset} className="mt-4 rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground">Try again</button>
      </div>
    </div>
  ),
  component: PostPage,
});

function renderBlock(block: BlogBlock, i: number) {
  switch (block.type) {
    case "p":
      return <p key={i} className="text-base leading-relaxed text-muted-foreground">{block.text}</p>;
    case "h2":
      return <h2 key={i} className="mt-8 text-2xl font-bold tracking-tight text-foreground">{block.text}</h2>;
    case "h3":
      return <h3 key={i} className="mt-6 text-xl font-semibold text-foreground">{block.text}</h3>;
    case "ul":
      return (
        <ul key={i} className="list-disc space-y-2 pl-6 text-muted-foreground">
          {block.items.map((it, j) => <li key={j}>{it}</li>)}
        </ul>
      );
    case "quote":
      return (
        <blockquote key={i} className="border-l-4 border-primary/60 bg-card/40 p-4 italic text-foreground">
          {block.text}
        </blockquote>
      );
    case "cta":
      return (
        <div key={i} className="my-6 rounded-xl border border-primary/30 bg-primary/5 p-6 text-center">
          <p className="text-lg font-semibold">{block.text}</p>
          <Link to={block.href} className="mt-3 inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
            {block.label} <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      );
  }
}

function PostPage() {
  const { post } = Route.useLoaderData();
  const related = BLOG_POSTS.filter((p) => p.slug !== post.slug).slice(0, 2);

  return (
    <div className="min-h-screen bg-background">
      <article className="mx-auto max-w-3xl px-6 py-12">
        <PageBreadcrumbs
          className="mb-4"
          crumbs={[
            { name: "Blog", path: "/blog" },
            { name: post.title, path: `/blog/${post.slug}` },
          ]}
        />

        <Link to="/blog" className="mb-6 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary">
          <ArrowLeft className="h-4 w-4" /> All posts
        </Link>

        <div className="flex items-center gap-2">
          {post.tags.map((t: string) => (
            <Badge key={t} variant="secondary">{t}</Badge>
          ))}
          <span className="text-xs text-muted-foreground">
            {new Date(post.date).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })} · {post.readMinutes} min read
          </span>
        </div>

        <h1 className="mt-3 text-4xl font-bold tracking-tight md:text-5xl">{post.title}</h1>
        <p className="mt-4 text-lg text-muted-foreground">{post.description}</p>

        <div className="mt-8 space-y-4">
          {post.body.map(renderBlock)}
        </div>

        {related.length > 0 && (
          <section className="mt-16 border-t border-border/50 pt-8">
            <h2 className="text-xl font-semibold">Keep reading</h2>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {related.map((r) => (
                <Link key={r.slug} to="/blog/$slug" params={{ slug: r.slug }} className="group rounded-lg border border-border/50 p-4 hover:border-primary/50">
                  <div className="text-xs text-muted-foreground">{r.tags.join(" · ")}</div>
                  <div className="mt-1 font-semibold group-hover:text-primary">{r.title}</div>
                  <div className="mt-1 line-clamp-2 text-sm text-muted-foreground">{r.description}</div>
                </Link>
              ))}
            </div>
          </section>
        )}
      </article>
    </div>
  );
}
