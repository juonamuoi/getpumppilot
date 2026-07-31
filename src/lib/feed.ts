// Pure builders for the journal feeds (RSS 2.0 + Atom 1.0).
// Kept dependency-free and side-effect-free so they can be unit tested and
// rendered from server routes.
import { BLOG_POSTS, type BlogPost } from "./blog-posts";
import { SITE_NAME, SITE_URL, socialImageUrl } from "./structured-data";

export const FEED_TITLE = `${SITE_NAME} Journal`;
export const FEED_DESCRIPTION =
  "Guides on AI investment apps, explainable momentum signals, paper trading and risk-first portfolio management from PumpPilot AI.";
export const RSS_PATH = "/rss.xml";
export const ATOM_PATH = "/atom.xml";
export const FEED_LANGUAGE = "en-us";

export interface FeedItem {
  slug: string;
  title: string;
  description: string;
  url: string;
  published: Date;
  updated: Date;
  categories: string[];
  imageUrl?: string;
  imageAlt?: string;
  html: string;
}

const esc = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

const cdata = (s: string) => `<![CDATA[${s.replace(/]]>/g, "]]&gt;")}]]>`;

function parseDate(iso: string): Date {
  // Blog dates are date-only ISO strings; anchor them at midday UTC so feed
  // readers in any timezone show the intended publish day.
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso}T12:00:00Z` : iso);
  return Number.isNaN(d.getTime()) ? new Date(0) : d;
}

/** Renders a post body into simple, reader-safe HTML for feed content. */
export function postToHtml(post: BlogPost): string {
  const parts: string[] = [];
  if (post.image) {
    parts.push(
      `<p><img src="${esc(socialImageUrl(post.image))}" alt="${esc(post.imageAlt ?? post.title)}" /></p>`,
    );
  }
  for (const block of post.body) {
    switch (block.type) {
      case "h2":
        parts.push(`<h2>${esc(block.text)}</h2>`);
        break;
      case "h3":
        parts.push(`<h3>${esc(block.text)}</h3>`);
        break;
      case "p":
        parts.push(`<p>${esc(block.text)}</p>`);
        break;
      case "quote":
        parts.push(`<blockquote><p>${esc(block.text)}</p></blockquote>`);
        break;
      case "ul":
        parts.push(`<ul>${block.items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>`);
        break;
      case "cta":
        parts.push(
          `<p>${esc(block.text)} <a href="${esc(
            block.href.startsWith("http") ? block.href : `${SITE_URL}${block.href}`,
          )}">${esc(block.label)}</a></p>`,
        );
        break;
    }
  }
  parts.push(
    `<p><em>Educational content only — not financial advice. PumpPilot AI runs in paper trading mode with clearly labeled mock market data.</em></p>`,
  );
  return parts.join("\n");
}

/** Newest-first list of feed items derived from published journal posts. */
export function feedItems(posts: BlogPost[] = BLOG_POSTS): FeedItem[] {
  return posts
    .map((post) => {
      const published = parseDate(post.date);
      return {
        slug: post.slug,
        title: post.title,
        description: post.description,
        url: `${SITE_URL}/blog/${post.slug}`,
        published,
        updated: post.updated ? parseDate(post.updated) : published,
        categories: [...new Set([...post.tags, ...post.keywords.slice(0, 4)])],
        imageUrl: post.image ? socialImageUrl(post.image) : undefined,
        imageAlt: post.imageAlt,
        html: postToHtml(post),
      };
    })
    .sort((a, b) => b.published.getTime() - a.published.getTime());
}

export function feedUpdatedAt(items: FeedItem[]): Date {
  return items.reduce<Date>(
    (max, i) => (i.updated.getTime() > max.getTime() ? i.updated : max),
    new Date(0),
  );
}

export function buildRss(items: FeedItem[] = feedItems()): string {
  const updated = feedUpdatedAt(items);
  const lines = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/">`,
    `  <channel>`,
    `    <title>${esc(FEED_TITLE)}</title>`,
    `    <link>${SITE_URL}/blog</link>`,
    `    <description>${esc(FEED_DESCRIPTION)}</description>`,
    `    <language>${FEED_LANGUAGE}</language>`,
    `    <lastBuildDate>${updated.toUTCString()}</lastBuildDate>`,
    `    <atom:link href="${SITE_URL}${RSS_PATH}" rel="self" type="application/rss+xml" />`,
    `    <image>`,
    `      <url>${socialImageUrl("/favicon.png")}</url>`,
    `      <title>${esc(FEED_TITLE)}</title>`,
    `      <link>${SITE_URL}/blog</link>`,
    `    </image>`,
  ];

  for (const item of items) {
    lines.push(
      `    <item>`,
      `      <title>${esc(item.title)}</title>`,
      `      <link>${item.url}</link>`,
      `      <guid isPermaLink="true">${item.url}</guid>`,
      `      <pubDate>${item.published.toUTCString()}</pubDate>`,
      `      <description>${esc(item.description)}</description>`,
      ...item.categories.map((c) => `      <category>${esc(c)}</category>`),
      ...(item.imageUrl
        ? [`      <enclosure url="${esc(item.imageUrl)}" type="image/jpeg" length="0" />`]
        : []),
      `      <content:encoded>${cdata(item.html)}</content:encoded>`,
      `    </item>`,
    );
  }

  lines.push(`  </channel>`, `</rss>`);
  return lines.join("\n");
}

export function buildAtom(items: FeedItem[] = feedItems()): string {
  const updated = feedUpdatedAt(items);
  const lines = [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<feed xmlns="http://www.w3.org/2005/Atom" xml:lang="en">`,
    `  <title>${esc(FEED_TITLE)}</title>`,
    `  <subtitle>${esc(FEED_DESCRIPTION)}</subtitle>`,
    `  <id>${SITE_URL}${ATOM_PATH}</id>`,
    `  <updated>${updated.toISOString()}</updated>`,
    `  <link rel="alternate" type="text/html" href="${SITE_URL}/blog" />`,
    `  <link rel="self" type="application/atom+xml" href="${SITE_URL}${ATOM_PATH}" />`,
    `  <icon>${socialImageUrl("/favicon.png")}</icon>`,
    `  <author><name>${esc(SITE_NAME)}</name><uri>${SITE_URL}</uri></author>`,
    `  <rights>© ${new Date().getUTCFullYear()} ${esc(SITE_NAME)}</rights>`,
  ];

  for (const item of items) {
    lines.push(
      `  <entry>`,
      `    <title>${esc(item.title)}</title>`,
      `    <id>${item.url}</id>`,
      `    <link rel="alternate" type="text/html" href="${item.url}" />`,
      `    <published>${item.published.toISOString()}</published>`,
      `    <updated>${item.updated.toISOString()}</updated>`,
      `    <summary type="text">${esc(item.description)}</summary>`,
      ...item.categories.map((c) => `    <category term="${esc(c)}" />`),
      `    <content type="html">${cdata(item.html)}</content>`,
      `  </entry>`,
    );
  }

  lines.push(`</feed>`);
  return lines.join("\n");
}

export function feedResponse(body: string, contentType: string): Response {
  return new Response(body, {
    headers: {
      "Content-Type": `${contentType}; charset=utf-8`,
      "Cache-Control": "public, max-age=1800, s-maxage=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
