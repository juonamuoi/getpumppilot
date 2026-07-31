/**
 * Centralised schema.org (JSON-LD) builders.
 *
 * Every public route should emit structured data from here so that the
 * organisation / publisher identity stays consistent across pages and
 * search engines can merge them into one entity graph.
 */

import { SOCIAL_IMAGE_HASHES } from "./social-image-hashes";

export const SITE_URL = "https://www.getpumppilot.app";
export const SITE_NAME = "PumpPilot AI";
export const SITE_TAGLINE = "Spot momentum. Control risk. Trade smarter.";

/**
 * Absolute, content-versioned URL for a social preview image.
 *
 * Social platforms cache og:image by URL, so a re-published image with the
 * same path keeps showing the old preview. Appending the content hash gives
 * every new version of the file a new URL.
 */
export const socialImageUrl = (publicPath: string) => {
  const p = publicPath.startsWith("/") ? publicPath : `/${publicPath}`;
  const hash = SOCIAL_IMAGE_HASHES[p];
  return `${SITE_URL}${p}${hash ? `?v=${hash}` : ""}`;
};

export const LOGO_URL = socialImageUrl("/favicon.png");
/** 1200x640 social/article image — Google requires wide images for Article rich results. */
export const SOCIAL_IMAGE_URL = socialImageUrl("/og-cover.jpg");
export const SOCIAL_IMAGE = {
  "@type": "ImageObject",
  url: SOCIAL_IMAGE_URL,
  width: 1200,
  height: 640,
} as const;

/**
 * Per-token social card (1200x630) for asset detail pages, content-hashed so
 * regenerating a card busts the crawler's cached preview. Falls back to the
 * site-wide cover when a token has no dedicated card yet.
 */
export const assetSocialImageUrl = (symbol: string) => {
  const p = `/og/asset-${symbol.toLowerCase()}.jpg`;
  return SOCIAL_IMAGE_HASHES[p] ? socialImageUrl(p) : SOCIAL_IMAGE_URL;
};

/** Stable @id values let crawlers link nodes across pages into one graph. */
export const ORG_ID = `${SITE_URL}/#organization`;
export const WEBSITE_ID = `${SITE_URL}/#website`;

export const absoluteUrl = (path = "/") =>
  path.startsWith("http") ? path : `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;

/**
 * The one canonical URL for a route. Every `<link rel="canonical">`,
 * `og:url` and schema `url` MUST come from here so a page never advertises
 * two spellings of itself (the usual cause of duplicate-entity warnings).
 * Home keeps its trailing slash; every other path is normalised without one.
 */
export function canonicalUrl(path = "/") {
  const abs = absoluteUrl(path);
  const [base] = abs.split("#");
  if (base === SITE_URL || base === `${SITE_URL}/`) return `${SITE_URL}/`;
  return base.endsWith("/") ? base.slice(0, -1) : base;
}

/**
 * Per-page `@id` scheme: `<canonical URL>#<node>`.
 *
 * One fragment per node type per page means the same logical entity always
 * carries the same identifier, and two different pages can never emit the
 * same `@id` — which is what stops crawlers from merging or flagging them
 * as duplicates.
 */
export const NODE = {
  webpage: "webpage",
  breadcrumb: "breadcrumb",
  faq: "faq",
  howto: "howto",
  article: "article",
  blog: "blog",
  product: "product",
  app: "app",
  api: "api",
  course: "course",
} as const;

export type NodeKind = (typeof NODE)[keyof typeof NODE] | (string & {});

export const nodeId = (path: string, node: NodeKind) => `${canonicalUrl(path)}#${node}`;


/** The canonical homepage URL every site-wide node points at. */
export const HOME_URL = canonicalUrl("/");

export const organizationSchema = {
  "@type": "Organization",
  "@id": ORG_ID,
  name: SITE_NAME,
  url: HOME_URL,
  slogan: SITE_TAGLINE,
  description:
    "PumpPilot AI builds explainable crypto momentum tooling: a market scanner, paper trading sandbox, AI coaching and strict risk controls.",
  logo: {
    "@type": "ImageObject",
    url: LOGO_URL,
    width: 512,
    height: 512,
  },
};

export const websiteSchema = {
  "@type": "WebSite",
  "@id": WEBSITE_ID,
  name: SITE_NAME,
  url: HOME_URL,
  description:
    "Explainable AI crypto momentum scanner, paper trading, backtesting and risk controls.",
  inLanguage: "en",
  publisher: { "@id": ORG_ID },
  potentialAction: {
    "@type": "SearchAction",
    target: {
      "@type": "EntryPoint",
      urlTemplate: `${SITE_URL}/scanner?q={search_term_string}`,
    },
    "query-input": "required name=search_term_string",
  },
};

/** Site-wide graph, emitted once from the root route. */
export const siteGraph = {
  "@context": "https://schema.org",
  "@graph": [organizationSchema, websiteSchema],
};

/* ------------------------------------------------------------------ *
 * Editorial authors
 *
 * Every BlogPosting references an author by stable `@id` instead of
 * inlining a bare name, and the matching Person/Organization node is
 * emitted in the same `@graph`. That lets crawlers attribute each post to
 * a real entity (and merge the same author across posts) while the
 * publisher stays the site Organization.
 * ------------------------------------------------------------------ */

export type AuthorKey = "editorial" | "research-desk" | "risk-desk";

export const authorId = (key: string) => `${SITE_URL}/#author-${key}`;

type AuthorDef = {
  type: "Person" | "Organization";
  name: string;
  jobTitle?: string;
  description: string;
  url: string;
};

export const AUTHORS: Record<AuthorKey, AuthorDef> = {
  editorial: {
    type: "Organization",
    name: `${SITE_NAME} Editorial Team`,
    description:
      "The PumpPilot AI editorial team writes explainable guides on crypto momentum, paper trading and risk management.",
    url: `${SITE_URL}/blog`,
  },
  "research-desk": {
    type: "Organization",
    name: `${SITE_NAME} Research Desk`,
    description:
      "Signal research and momentum-model analysis published by the PumpPilot AI research desk.",
    url: `${SITE_URL}/blog`,
  },
  "risk-desk": {
    type: "Organization",
    name: `${SITE_NAME} Risk Desk`,
    description:
      "Risk-control, security and safe-trading guidance from the PumpPilot AI risk desk.",
    url: `${SITE_URL}/blog`,
  },
};

export const DEFAULT_AUTHOR: AuthorKey = "editorial";

const resolveAuthorKey = (key?: string): AuthorKey =>
  key && key in AUTHORS ? (key as AuthorKey) : DEFAULT_AUTHOR;

/** Full author node for the `@graph`; always affiliated with the publisher. */
export function authorSchema(key?: string) {
  const k = resolveAuthorKey(key);
  const a = AUTHORS[k];
  return {
    "@type": a.type,
    "@id": authorId(k),
    name: a.name,
    description: a.description,
    url: a.url,
    ...(a.jobTitle ? { jobTitle: a.jobTitle } : {}),
    ...(a.type === "Person"
      ? { worksFor: { "@id": ORG_ID } }
      : { parentOrganization: { "@id": ORG_ID } }),
    ...(a.type === "Person" ? { affiliation: { "@id": ORG_ID } } : {}),
    // Google's logo rich result requires `logo` on every Organization node,
    // including editorial desks, so reuse the site mark.
    ...(a.type === "Organization"
      ? { logo: { "@type": "ImageObject", url: LOGO_URL, caption: a.name } }
      : {}),
    publishingPrinciples: `${SITE_URL}/risk-disclosure`,
  };
}

/** Publisher node reference used by every editorial node. */
export const publisherRef = { "@id": ORG_ID } as const;

/** Deduplicated author nodes for a set of posts (blog index / post pages). */
export function authorNodesFor(posts: { author?: string }[]) {
  const keys = Array.from(new Set(posts.map((p) => resolveAuthorKey(p.author))));
  return keys.map((k) => authorSchema(k));
}

export type BlogPostMeta = {
  slug: string;
  title: string;
  description: string;
  /** ISO publish date. */
  date: string;
  /** ISO last-updated date; falls back to `date`. */
  updated?: string;
  keywords?: string[];
  tags?: string[];
  image?: string;
  imageAlt?: string;
  readMinutes?: number;
  wordCount?: number;
  /** Key into AUTHORS; falls back to the editorial team. */
  author?: string;
};

/**
 * BlogPosting node for a single post. Shared by the blog index (embedded in
 * the `Blog` node) and each post route so headline, description, author,
 * publisher and publish/update dates are always identical for the same URL.
 *
 * `author` is a reference to a stable author `@id`; the matching
 * Person/Organization node must be emitted in the same `@graph` (use
 * `authorNodesFor`). `publisher` always resolves to the site Organization.
 */
export function blogPostingSchema(
  post: BlogPostMeta,
  opts: { standalone?: boolean } = {},
) {
  const url = canonicalUrl(`/blog/${post.slug}`);
  const imageUrl = post.image ? socialImageUrl(post.image) : SOCIAL_IMAGE_URL;
  const authorKey = resolveAuthorKey(post.author);
  const node: Record<string, unknown> = {
    ...(opts.standalone ? { "@context": "https://schema.org" } : {}),
    "@type": "BlogPosting",
    "@id": `${url}#${NODE.article}`,
    headline: post.title,
    name: post.title,
    description: post.description,
    datePublished: post.date,
    dateModified: post.updated ?? post.date,
    // Standalone emission has no surrounding graph to resolve the @id, so
    // inline the full author node there and reference it otherwise.
    author: opts.standalone ? authorSchema(authorKey) : { "@id": authorId(authorKey) },
    creator: { "@id": authorId(authorKey) },
    publisher: publisherRef,
    copyrightHolder: publisherRef,
    sourceOrganization: publisherRef,

    image: {
      "@type": "ImageObject",
      url: imageUrl,
      width: 1200,
      height: 630,
      caption: post.imageAlt ?? post.title,
    },
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    isPartOf: { "@id": nodeId("/blog", NODE.blog) },
    url,
    inLanguage: "en",
  };
  if (post.keywords?.length) node.keywords = post.keywords.join(", ");
  if (post.tags?.length) node.articleSection = post.tags;
  if (post.wordCount) node.wordCount = post.wordCount;
  if (post.readMinutes) node.timeRequired = `PT${post.readMinutes}M`;
  return node;
}

/**
 * WebPage node for a single journal entry. `breadcrumb` belongs on the page
 * (schema.org domain: WebPage), so this node is what ties the article to the
 * page's BreadcrumbList — the article stays reachable via `mainEntity`.
 */
export function blogPostPageSchema(post: { slug: string; title: string; description: string }) {
  const path = `/blog/${post.slug}`;
  const url = canonicalUrl(path);
  return {
    "@type": "WebPage",
    "@id": `${url}#${NODE.webpage}`,
    url,
    name: post.title,
    description: post.description,
    inLanguage: "en",
    isPartOf: { "@id": WEBSITE_ID },
    breadcrumb: { "@id": nodeId(path, NODE.breadcrumb) },
    mainEntity: { "@id": `${url}#${NODE.article}` },
  };
}

export type Crumb = { name: string; path: string };

/**
 * BreadcrumbList — helps Google render the breadcrumb trail in results.
 * Home is always position 1; the trail is self-identified with an `@id`
 * anchored to the current (last) page so nodes stay unique per URL.
 */
export function breadcrumbSchema(crumbs: Crumb[]) {
  const trail: Crumb[] = [{ name: "Home", path: "/" }, ...crumbs];
  const current = trail[trail.length - 1];
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "@id": nodeId(current.path, NODE.breadcrumb),
    name: trail.map((c) => c.name).join(" › "),
    itemListElement: trail.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: c.name,
      item: canonicalUrl(c.path),
    })),
  };
}


/** Generic WebPage node, used for informational and legal pages. */
export function webPageSchema(opts: {
  name: string;
  description: string;
  path: string;
  type?: string;
  /** Overrides the `@id` fragment when a page emits more than one page-level node. */
  node?: NodeKind;
  datePublished?: string;
  dateModified?: string;
}) {
  const url = canonicalUrl(opts.path);
  return {
    "@context": "https://schema.org",
    "@type": opts.type ?? "WebPage",
    "@id": `${url}#${opts.node ?? NODE.webpage}`,
    name: opts.name,
    description: opts.description,
    url,
    inLanguage: "en",
    isPartOf: { "@id": WEBSITE_ID },
    publisher: { "@id": ORG_ID },
    ...(opts.datePublished ? { datePublished: opts.datePublished } : {}),
    ...(opts.dateModified ? { dateModified: opts.dateModified } : {}),
  };
}

/**
 * Legal pages (terms, privacy, refunds, risk disclosure).
 * Emits a WebPage node typed as a LegalPage so crawlers treat it as
 * policy content rather than ordinary marketing copy.
 */
export function legalPageSchema(opts: {
  name: string;
  description: string;
  path: string;
  /** Only pass an authoritative review date; omit when unknown. */
  lastReviewed?: string;
}) {
  const base = webPageSchema({
    name: opts.name,
    description: opts.description,
    path: opts.path,
  });
  return {
    ...base,
    additionalType: "https://schema.org/LegalPage",
    about: { "@id": ORG_ID },
    reviewedBy: { "@id": ORG_ID },
    ...(opts.lastReviewed ? { lastReviewed: opts.lastReviewed } : {}),
  };
}

/**
 * FAQPage node. Pass the route path to bind the FAQ to that exact URL with a
 * stable @id — Google needs the Q&A tied to the page it is rendered on to be
 * eligible for FAQ rich results.
 */
export function faqSchema(faqs: { q: string; a: string }[], path?: string) {
  const url = path ? canonicalUrl(path) : undefined;
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    ...(url
      ? {
          "@id": `${url}#${NODE.faq}`,
          url,
          mainEntityOfPage: { "@type": "WebPage", "@id": url },
          isPartOf: { "@id": WEBSITE_ID },
          publisher: { "@id": ORG_ID },
          inLanguage: "en",
        }
      : {}),
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };
}


export type HowToStep = {
  name: string;
  text: string;
  /** Optional in-page anchor so each step deep-links to the visible UI. */
  anchor?: string;
};

/**
 * HowTo — targets the step-by-step rich result for help flows.
 * The steps MUST mirror the visible instructions rendered on the page.
 */
export function howToSchema(opts: {
  name: string;
  description: string;
  path: string;
  /** ISO 8601 duration, e.g. "PT3M". */
  totalTime?: string;
  tools?: string[];
  steps: HowToStep[];
}) {
  const url = canonicalUrl(opts.path);
  return {
    "@context": "https://schema.org",
    "@type": "HowTo",
    "@id": `${url}#${NODE.howto}`,
    name: opts.name,
    description: opts.description,
    url,
    inLanguage: "en",
    isPartOf: { "@id": WEBSITE_ID },
    publisher: { "@id": ORG_ID },
    image: SOCIAL_IMAGE,
    ...(opts.totalTime ? { totalTime: opts.totalTime } : {}),
    ...(opts.tools?.length
      ? { tool: opts.tools.map((t) => ({ "@type": "HowToTool", name: t })) }
      : {}),
    estimatedCost: {
      "@type": "MonetaryAmount",
      currency: "USD",
      value: "0",
    },
    step: opts.steps.map((s, i) => ({
      "@type": "HowToStep",
      position: i + 1,
      name: s.name,
      text: s.text,
      url: s.anchor ? `${url}#${s.anchor}` : url,
    })),
  };
}


/**
 * Article node for pages whose main content is editorial/explanatory prose
 * (guides, explainers). App screens should NOT emit this — Google treats
 * Article on a tool UI as mismatched structured data.
 */
export function articleSchema(opts: {
  headline: string;
  description: string;
  path: string;
  datePublished: string;
  dateModified?: string;
  image?: string;
  imageAlt?: string;
  section?: string;
  /** Use "Article" (default) or a subtype such as "TechArticle". */
  type?: string;
}) {
  const url = canonicalUrl(opts.path);
  return {
    "@context": "https://schema.org",
    "@type": opts.type ?? "Article",
    "@id": `${url}#${NODE.article}`,
    headline: opts.headline,
    name: opts.headline,
    description: opts.description,
    datePublished: opts.datePublished,
    dateModified: opts.dateModified ?? opts.datePublished,
    author: { "@id": ORG_ID },
    publisher: { "@id": ORG_ID },
    isPartOf: { "@id": WEBSITE_ID },
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    image: {
      "@type": "ImageObject",
      url: opts.image ?? SOCIAL_IMAGE_URL,
      width: 1200,
      height: 630,
      caption: opts.imageAlt ?? opts.headline,
    },
    ...(opts.section ? { articleSection: opts.section } : {}),
    url,
    inLanguage: "en",
  };
}

/**
 * Single per-page `@graph` that always carries the site-wide Organization and
 * WebSite nodes alongside the page's own nodes. Stable `@id`s mean crawlers
 * merge these with the root graph instead of seeing competing entities.
 */
export function pageEntityGraph(nodes: unknown[]) {
  const strip = (n: unknown) => {
    if (!n || typeof n !== "object") return n;
    const { "@context": _ctx, ...rest } = n as Record<string, unknown>;
    return rest;
  };
  return {
    "@context": "https://schema.org",
    "@graph": [organizationSchema, websiteSchema, ...nodes.map(strip)],
  };
}

/** Convenience wrapper so routes can pass objects straight into head().scripts. */
export const ldScript = (schema: unknown) => ({
  type: "application/ld+json",
  children: JSON.stringify(schema),
});

/**
 * Demo market data for one asset, expressed as three linked schema.org nodes:
 *
 *   - `CryptoCurrency` (pending.schema.org, subtype of FinancialProduct) —
 *     the asset itself, explicitly labelled as simulated demo data.
 *   - `DataFeed` — the momentum/price readings the page displays, each reading
 *     a `DataFeedItem` wrapping a `PropertyValue`.
 *   - `CreativeWork` — the human-readable momentum analysis, `about` the
 *     currency and `isBasedOn` the feed, with the risk disclaimer attached.
 *
 * Every node repeats the "simulated demo data, not investment advice" label so
 * a crawler can never mistake these numbers for real market quotes.
 */
export type AssetDemoData = {
  symbol: string;
  name: string;
  price: number;
  change24h: number;
  volume24h: number;
  marketCap: number;
  momentum: { total: number; reason: string };
};

export const DEMO_DATA_LABEL =
  "Simulated demo data generated by PumpPilot AI. Not real market data, not a quote, and not investment advice.";

export function assetDemoDataNodes(asset: AssetDemoData, opts: { updated?: string } = {}) {
  const slug = asset.symbol.toLowerCase();
  const path = `/asset/${slug}`;
  const url = canonicalUrl(path);
  const dateModified = opts.updated ?? new Date().toISOString().slice(0, 10);

  const currencyId = nodeId(path, "currency");
  const feedId = nodeId(path, "datafeed");

  const reading = (name: string, value: number, unitText?: string) => ({
    "@type": "DataFeedItem",
    dateModified,
    item: {
      "@type": "PropertyValue",
      name,
      value,
      ...(unitText ? { unitText } : {}),
    },
  });

  const currency = {
    "@type": ["CryptoCurrency", "FinancialProduct"],
    "@id": currencyId,
    name: `${asset.name} (${asset.symbol}) — demo asset`,
    alternateName: asset.symbol,
    identifier: asset.symbol,
    url,
    description: `${asset.name} (${asset.symbol}) as shown on PumpPilot AI. ${DEMO_DATA_LABEL}`,
    disambiguatingDescription: DEMO_DATA_LABEL,
    provider: { "@id": ORG_ID },
  };

  const feed = {
    "@type": "DataFeed",
    "@id": feedId,
    name: `${asset.symbol} demo momentum data feed`,
    description: `Simulated price, volume and momentum readings for ${asset.name} (${asset.symbol}). ${DEMO_DATA_LABEL}`,
    disambiguatingDescription: DEMO_DATA_LABEL,
    url,
    inLanguage: "en",
    isAccessibleForFree: true,
    dateModified,
    creator: { "@id": ORG_ID },
    provider: { "@id": ORG_ID },
    about: { "@id": currencyId },
    dataFeedElement: [
      reading("Demo price", Number(asset.price.toFixed(2)), "USD"),
      reading("Demo 24h change", Number(asset.change24h.toFixed(2)), "PERCENT"),
      reading("Demo 24h volume", asset.volume24h, "USD"),
      reading("Demo market cap", asset.marketCap, "USD"),
      reading("Demo momentum score", asset.momentum.total, "P1"),
    ],
  };

  const analysis = {
    "@type": "CreativeWork",
    "@id": nodeId(path, "analysis"),
    name: `${asset.symbol} momentum analysis (demo)`,
    headline: `${asset.name} (${asset.symbol}) momentum analysis — demo`,
    abstract: asset.momentum.reason,
    text: `${asset.momentum.reason} ${DEMO_DATA_LABEL}`,
    creativeWorkStatus: "Demo — simulated data",
    disambiguatingDescription: DEMO_DATA_LABEL,
    about: { "@id": currencyId },
    isBasedOn: { "@id": feedId },
    usageInfo: canonicalUrl("/risk-disclosure"),
    isAccessibleForFree: true,
    inLanguage: "en",
    dateModified,
    url,
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    author: { "@id": ORG_ID },
    publisher: { "@id": ORG_ID },
  };

  return [currency, feed, analysis];
}
