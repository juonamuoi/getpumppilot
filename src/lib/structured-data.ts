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

/** Stable @id values let crawlers link nodes across pages into one graph. */
export const ORG_ID = `${SITE_URL}/#organization`;
export const WEBSITE_ID = `${SITE_URL}/#website`;

export const absoluteUrl = (path = "/") =>
  path.startsWith("http") ? path : `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;

export const organizationSchema = {
  "@type": "Organization",
  "@id": ORG_ID,
  name: SITE_NAME,
  url: SITE_URL,
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
  url: SITE_URL,
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
    "@id": `${absoluteUrl(current.path)}#breadcrumb`,
    name: trail.map((c) => c.name).join(" › "),
    itemListElement: trail.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: c.name,
      item: absoluteUrl(c.path),
    })),
  };
}


/** Generic WebPage node, used for informational and legal pages. */
export function webPageSchema(opts: {
  name: string;
  description: string;
  path: string;
  type?: string;
  datePublished?: string;
  dateModified?: string;
}) {
  const url = absoluteUrl(opts.path);
  return {
    "@context": "https://schema.org",
    "@type": opts.type ?? "WebPage",
    "@id": `${url}#webpage`,
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

export function faqSchema(faqs: { q: string; a: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
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
  const url = absoluteUrl(opts.path);
  return {
    "@context": "https://schema.org",
    "@type": "HowTo",
    "@id": `${url}#howto`,
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


/** Convenience wrapper so routes can pass objects straight into head().scripts. */
export const ldScript = (schema: unknown) => ({
  type: "application/ld+json",
  children: JSON.stringify(schema),
});
