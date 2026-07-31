/**
 * Google rich-result eligibility checks for the JSON-LD we emit.
 *
 * `validateJsonLd` (jsonld-validate.ts) answers "is this well-formed
 * structured data?". This module answers the stricter question Google's Rich
 * Results Test asks: "does this node carry the signals required to be
 * *eligible* for a rich result?" — required + strongly recommended properties,
 * length limits, ISO-8601 dates, image ratios, and search-action wiring.
 *
 * Severity:
 *   - "error"   → Google would report the item as ineligible / invalid.
 *   - "warning" → item is eligible but missing a recommended signal.
 *
 * CI fails on errors; warnings are printed for visibility.
 */

export type RichResultSeverity = "error" | "warning";

export type RichResultIssue = {
  /** Route or document label the node came from. */
  source: string;
  /** JSON pointer-ish path to the node. */
  path: string;
  type: string;
  severity: RichResultSeverity;
  code: string;
  message: string;
};

/** Types that produce a Google rich result and are therefore checked here. */
export const RICH_RESULT_TYPES = [
  "Article",
  "BlogPosting",
  "NewsArticle",
  "BreadcrumbList",
  "FAQPage",
  "HowTo",
  "Organization",
  "WebSite",
  "Product",
  "SoftwareApplication",
] as const;

export type RichResultType = (typeof RICH_RESULT_TYPES)[number];

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const asArray = <T,>(v: T | T[] | undefined): T[] =>
  v === undefined ? [] : Array.isArray(v) ? v : [v];

const typesOf = (node: Record<string, unknown>): string[] =>
  asArray(node["@type"] as string | string[] | undefined).filter(
    (t): t is string => typeof t === "string",
  );

const text = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/** Google requires absolute, crawlable https URLs in rich-result properties. */
const isHttpsUrl = (v: unknown): boolean =>
  typeof v === "string" && /^https:\/\/[^\s]+$/.test(v.replace(/\{[^}]+\}/g, "x"));

/** Accepts a URL string, ImageObject, or array of either. */
function imageUrls(value: unknown): string[] {
  return asArray(value as unknown[]).flatMap((entry) => {
    if (typeof entry === "string") return [entry];
    if (isRecord(entry)) {
      const url = entry.url ?? entry.contentUrl;
      return typeof url === "string" ? [url] : [];
    }
    return [];
  });
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})?)?$/;

function isIsoDate(value: unknown): boolean {
  const raw = text(value);
  if (!ISO_DATE.test(raw)) return false;
  return !Number.isNaN(Date.parse(raw));
}

/** A node that is only `{ "@id": ... }` points at a definition elsewhere. */
function isReference(node: Record<string, unknown>): boolean {
  return (
    typeof node["@id"] === "string" &&
    Object.keys(node).every((k) => k === "@id" || k === "@type" || k === "@context")
  );
}

type Ctx = {
  source: string;
  path: string;
  type: string;
  issues: RichResultIssue[];
  /** Every node in the same document, so `@id` references can be resolved. */
  index: Map<string, Record<string, unknown>>;
};

function push(
  ctx: Ctx,
  severity: RichResultSeverity,
  code: string,
  message: string,
  suffix = "",
) {
  ctx.issues.push({
    source: ctx.source,
    path: ctx.path + suffix,
    type: ctx.type,
    severity,
    code,
    message,
  });
}

/** Resolve `{ "@id": "..." }` references against the document index. */
function deref(value: unknown, ctx: Ctx): Record<string, unknown> | undefined {
  if (!isRecord(value)) return undefined;
  if (isReference(value)) return ctx.index.get(value["@id"] as string) ?? value;
  return value;
}

function checkArticle(node: Record<string, unknown>, ctx: Ctx) {
  const headline = text(node.headline);
  if (!headline) {
    push(ctx, "error", "article_headline_missing", "headline is required");
  } else if (headline.length > 110) {
    push(
      ctx,
      "error",
      "article_headline_too_long",
      `headline must be <= 110 characters for rich results (got ${headline.length})`,
    );
  }

  const images = imageUrls(node.image);
  if (images.length === 0) {
    push(ctx, "error", "article_image_missing", "image is required (>=1200px wide recommended)");
  } else if (!images.every(isHttpsUrl)) {
    push(ctx, "error", "article_image_not_https", `image must be an absolute https URL: ${images.join(", ")}`);
  }

  if (!isIsoDate(node.datePublished)) {
    push(
      ctx,
      "error",
      "article_date_published_invalid",
      `datePublished must be ISO 8601 (got ${JSON.stringify(node.datePublished)})`,
    );
  }
  if (node.dateModified !== undefined && !isIsoDate(node.dateModified)) {
    push(ctx, "error", "article_date_modified_invalid", "dateModified must be ISO 8601");
  } else if (node.dateModified === undefined) {
    push(ctx, "warning", "article_date_modified_missing", "dateModified is recommended");
  }

  const authors = asArray(node.author as unknown[]).map((a) => deref(a, ctx));
  if (authors.length === 0) {
    push(ctx, "error", "article_author_missing", "author is required");
  } else {
    authors.forEach((author, i) => {
      if (!author || !text(author.name)) {
        push(ctx, "error", "article_author_name_missing", "author.name is required", `.author[${i}]`);
      }
      const authorTypes = author ? typesOf(author) : [];
      if (author && !authorTypes.some((t) => t === "Person" || t === "Organization")) {
        push(
          ctx,
          "error",
          "article_author_type_invalid",
          "author @type must be Person or Organization",
          `.author[${i}]`,
        );
      }
    });
  }

  const publisher = deref(node.publisher, ctx);
  if (!publisher) {
    push(ctx, "warning", "article_publisher_missing", "publisher is recommended");
  } else {
    if (!text(publisher.name)) {
      push(ctx, "error", "article_publisher_name_missing", "publisher.name is required", ".publisher");
    }
    const logo = imageUrls(publisher.logo);
    if (logo.length === 0 || !logo.every(isHttpsUrl)) {
      push(
        ctx,
        "warning",
        "article_publisher_logo_missing",
        "publisher.logo (absolute https URL) is recommended",
        ".publisher",
      );
    }
  }

  const main = node.mainEntityOfPage;
  if (main === undefined) {
    push(ctx, "warning", "article_main_entity_missing", "mainEntityOfPage is recommended");
  } else {
    const url = typeof main === "string" ? main : isRecord(main) ? text(main["@id"] ?? main.url) : "";
    if (!isHttpsUrl(url)) {
      push(ctx, "error", "article_main_entity_invalid", "mainEntityOfPage must be an absolute https URL");
    }
  }
}

function checkBreadcrumbList(node: Record<string, unknown>, ctx: Ctx) {
  const items = asArray(node.itemListElement as unknown[]);
  if (items.length < 2) {
    push(
      ctx,
      "error",
      "breadcrumb_too_short",
      `BreadcrumbList needs >= 2 ListItems to be eligible (got ${items.length})`,
    );
  }
  items.forEach((raw, i) => {
    const item = isRecord(raw) ? raw : {};
    const suffix = `.itemListElement[${i}]`;
    if (!typesOf(item).includes("ListItem")) {
      push(ctx, "error", "breadcrumb_item_type", "each entry must be @type ListItem", suffix);
    }
    if (item.position !== i + 1) {
      push(
        ctx,
        "error",
        "breadcrumb_position",
        `position must be ${i + 1} (1-based, in order), got ${String(item.position)}`,
        suffix,
      );
    }
    if (!text(item.name)) {
      push(ctx, "error", "breadcrumb_name_missing", "ListItem.name is required", suffix);
    }
    const target = typeof item.item === "string" ? item.item : isRecord(item.item) ? text(item.item["@id"]) : "";
    const isLast = i === items.length - 1;
    if (!target && !isLast) {
      push(ctx, "error", "breadcrumb_item_missing", "ListItem.item is required except on the last crumb", suffix);
    }
    if (target && !isHttpsUrl(target)) {
      push(ctx, "error", "breadcrumb_item_not_https", `ListItem.item must be an absolute https URL: ${target}`, suffix);
    }
  });
}

function checkFaqPage(node: Record<string, unknown>, ctx: Ctx) {
  const entities = asArray(node.mainEntity as unknown[]);
  if (entities.length === 0) {
    push(ctx, "error", "faq_empty", "FAQPage requires at least one Question");
  }
  entities.forEach((raw, i) => {
    const q = isRecord(raw) ? raw : {};
    const suffix = `.mainEntity[${i}]`;
    if (!typesOf(q).includes("Question")) {
      push(ctx, "error", "faq_question_type", "mainEntity entries must be @type Question", suffix);
    }
    if (!text(q.name)) {
      push(ctx, "error", "faq_question_name", "Question.name is required", suffix);
    }
    const answer = isRecord(q.acceptedAnswer) ? q.acceptedAnswer : undefined;
    if (!answer) {
      push(ctx, "error", "faq_answer_missing", "Question.acceptedAnswer is required", suffix);
      return;
    }
    if (!typesOf(answer).includes("Answer")) {
      push(ctx, "error", "faq_answer_type", "acceptedAnswer must be @type Answer", `${suffix}.acceptedAnswer`);
    }
    const body = text(answer.text);
    if (!body) {
      push(ctx, "error", "faq_answer_text", "acceptedAnswer.text is required", `${suffix}.acceptedAnswer`);
    } else if (/<(script|iframe|style)\b/i.test(body)) {
      push(
        ctx,
        "error",
        "faq_answer_unsafe_html",
        "acceptedAnswer.text may not contain script/iframe/style markup",
        `${suffix}.acceptedAnswer`,
      );
    }
  });
}

function checkHowTo(node: Record<string, unknown>, ctx: Ctx) {
  if (!text(node.name)) push(ctx, "error", "howto_name_missing", "HowTo.name is required");
  const steps = asArray(node.step as unknown[]);
  if (steps.length < 2) {
    push(ctx, "error", "howto_too_few_steps", `HowTo needs >= 2 steps (got ${steps.length})`);
  }
  steps.forEach((raw, i) => {
    const step = isRecord(raw) ? raw : {};
    const suffix = `.step[${i}]`;
    if (!typesOf(step).some((t) => t === "HowToStep" || t === "HowToSection")) {
      push(ctx, "error", "howto_step_type", "step entries must be @type HowToStep", suffix);
    }
    if (!text(step.name)) push(ctx, "error", "howto_step_name", "HowToStep.name is required", suffix);
    if (!text(step.text)) push(ctx, "error", "howto_step_text", "HowToStep.text is required", suffix);
  });
}

function checkOrganization(node: Record<string, unknown>, ctx: Ctx) {
  if (!text(node.name)) push(ctx, "error", "org_name_missing", "Organization.name is required");
  if (!isHttpsUrl(node.url)) push(ctx, "error", "org_url_invalid", "Organization.url must be absolute https");
  const logo = imageUrls(node.logo);
  if (logo.length === 0) {
    push(ctx, "error", "org_logo_missing", "Organization.logo is required for the logo rich result");
  } else if (!logo.every(isHttpsUrl)) {
    push(ctx, "error", "org_logo_not_https", "Organization.logo must be an absolute https URL");
  }
  const sameAs = asArray(node.sameAs as unknown[]);
  if (sameAs.length === 0) {
    push(ctx, "warning", "org_same_as_missing", "sameAs profiles are recommended for knowledge-panel signals");
  } else if (!sameAs.every(isHttpsUrl)) {
    push(ctx, "error", "org_same_as_not_https", "every sameAs entry must be an absolute https URL");
  }
}

function checkWebSite(node: Record<string, unknown>, ctx: Ctx) {
  if (!text(node.name)) push(ctx, "error", "website_name_missing", "WebSite.name is required");
  if (!isHttpsUrl(node.url)) push(ctx, "error", "website_url_invalid", "WebSite.url must be absolute https");

  const actions = asArray(node.potentialAction as unknown[]).filter(isRecord);
  const search = actions.find((a) => typesOf(a).includes("SearchAction"));
  if (!search) {
    push(ctx, "warning", "website_search_action_missing", "SearchAction enables the sitelinks search box");
    return;
  }
  const target = search.target;
  const template =
    typeof target === "string" ? target : isRecord(target) ? text(target.urlTemplate) : "";
  if (!template || !isHttpsUrl(template)) {
    push(ctx, "error", "search_action_target_invalid", "SearchAction.target must be an absolute https URL template", ".potentialAction");
  }
  const queryInput = text(search["query-input"]);
  const placeholder = /\{([a-zA-Z_][\w]*)\}/.exec(template)?.[1];
  if (!queryInput) {
    push(ctx, "error", "search_action_query_input_missing", "SearchAction requires a query-input", ".potentialAction");
  } else if (!/^required\s+name=/.test(queryInput)) {
    push(
      ctx,
      "error",
      "search_action_query_input_format",
      `query-input must look like "required name=search_term_string" (got "${queryInput}")`,
      ".potentialAction",
    );
  } else if (placeholder && !queryInput.includes(`name=${placeholder}`)) {
    push(
      ctx,
      "error",
      "search_action_query_input_mismatch",
      `query-input name must match the {${placeholder}} placeholder in target`,
      ".potentialAction",
    );
  }
}

function checkOffers(node: Record<string, unknown>, ctx: Ctx, required: boolean) {
  const offers = asArray(node.offers as unknown[]).filter(isRecord);
  if (offers.length === 0) {
    push(
      ctx,
      required ? "error" : "warning",
      "offers_missing",
      "offers is needed for the price rich result",
    );
    return;
  }
  offers.forEach((offer, i) => {
    const suffix = `.offers[${i}]`;
    const price = offer.price ?? offer.lowPrice;
    if (price === undefined || text(String(price)) === "") {
      push(ctx, "error", "offer_price_missing", "Offer.price is required", suffix);
    } else if (!/^\d+(\.\d+)?$/.test(String(price))) {
      push(ctx, "error", "offer_price_format", `Offer.price must be a plain number (got "${String(price)}")`, suffix);
    }
    if (!/^[A-Z]{3}$/.test(text(offer.priceCurrency))) {
      push(ctx, "error", "offer_currency_invalid", "Offer.priceCurrency must be a 3-letter ISO code", suffix);
    }
  });
}

function checkAggregateRating(node: Record<string, unknown>, ctx: Ctx) {
  const rating = deref(node.aggregateRating, ctx);
  if (!rating) return;
  const value = Number(rating.ratingValue);
  const count = Number(rating.ratingCount ?? rating.reviewCount);
  if (!Number.isFinite(value)) {
    push(ctx, "error", "rating_value_invalid", "aggregateRating.ratingValue must be numeric", ".aggregateRating");
  }
  if (!Number.isFinite(count) || count < 1) {
    push(
      ctx,
      "error",
      "rating_count_invalid",
      "aggregateRating needs ratingCount or reviewCount >= 1",
      ".aggregateRating",
    );
  }
}

function checkProduct(node: Record<string, unknown>, ctx: Ctx) {
  if (!text(node.name)) push(ctx, "error", "product_name_missing", "Product.name is required");
  if (imageUrls(node.image).length === 0) {
    push(ctx, "warning", "product_image_missing", "Product.image is recommended");
  }
  checkOffers(node, ctx, true);
  checkAggregateRating(node, ctx);
}

function checkSoftwareApplication(node: Record<string, unknown>, ctx: Ctx) {
  if (!text(node.name)) push(ctx, "error", "app_name_missing", "SoftwareApplication.name is required");
  if (!text(node.applicationCategory)) {
    push(ctx, "error", "app_category_missing", "applicationCategory is required for the app rich result");
  }
  if (!text(node.operatingSystem)) {
    push(ctx, "warning", "app_os_missing", "operatingSystem is recommended");
  }
  checkOffers(node, ctx, true);
  checkAggregateRating(node, ctx);
}

const CHECKS: Record<string, (node: Record<string, unknown>, ctx: Ctx) => void> = {
  Article: checkArticle,
  BlogPosting: checkArticle,
  NewsArticle: checkArticle,
  BreadcrumbList: checkBreadcrumbList,
  FAQPage: checkFaqPage,
  HowTo: checkHowTo,
  Organization: checkOrganization,
  WebSite: checkWebSite,
  Product: checkProduct,
  SoftwareApplication: checkSoftwareApplication,
};

/** Flatten a JSON-LD document (object, array, or @graph) into its nodes. */
function collectNodes(doc: unknown, path: string, out: Array<{ node: Record<string, unknown>; path: string }>) {
  if (Array.isArray(doc)) {
    doc.forEach((entry, i) => collectNodes(entry, `${path}[${i}]`, out));
    return;
  }
  if (!isRecord(doc)) return;
  const graph = doc["@graph"];
  if (Array.isArray(graph)) {
    graph.forEach((entry, i) => collectNodes(entry, `${path}.@graph[${i}]`, out));
    return;
  }
  out.push({ node: doc, path });
}

export type RichResultReport = {
  source: string;
  /** Types found on the page that map to a Google rich result. */
  types: string[];
  issues: RichResultIssue[];
  errors: RichResultIssue[];
  warnings: RichResultIssue[];
};

/**
 * Check every rich-result-bearing node in one page's JSON-LD documents.
 * `docs` are already-parsed JSON-LD values (one per <script> tag).
 */
export function checkRichResults(docs: unknown[], source: string): RichResultReport {
  const nodes: Array<{ node: Record<string, unknown>; path: string }> = [];
  docs.forEach((doc, i) => collectNodes(doc, `doc[${i}]`, nodes));

  const index = new Map<string, Record<string, unknown>>();
  for (const { node } of nodes) {
    const id = node["@id"];
    if (typeof id === "string" && !isReference(node)) index.set(id, node);
  }

  const issues: RichResultIssue[] = [];
  const types = new Set<string>();

  for (const { node, path } of nodes) {
    if (isReference(node)) continue;
    for (const type of typesOf(node)) {
      const check = CHECKS[type];
      if (!check) continue;
      types.add(type);
      check(node, { source, path, type, issues, index });
    }
  }

  return {
    source,
    types: [...types].sort(),
    issues,
    errors: issues.filter((i) => i.severity === "error"),
    warnings: issues.filter((i) => i.severity === "warning"),
  };
}

/** Extract raw `application/ld+json` script bodies from an HTML document. */
export function extractJsonLdBlocks(html: string): string[] {
  const blocks: string[] = [];
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    blocks.push(
      match[1]
        .replace(/&quot;/g, '"')
        .replace(/&#x27;|&apos;/g, "'")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&amp;/g, "&")
        .trim(),
    );
  }
  return blocks;
}

export type ParsedJsonLd = {
  docs: unknown[];
  parseErrors: RichResultIssue[];
};

/** Parse extracted blocks, reporting unparseable ones as errors. */
export function parseJsonLdBlocks(blocks: string[], source: string): ParsedJsonLd {
  const docs: unknown[] = [];
  const parseErrors: RichResultIssue[] = [];
  blocks.forEach((raw, i) => {
    try {
      docs.push(JSON.parse(raw));
    } catch (err) {
      parseErrors.push({
        source,
        path: `script[${i}]`,
        type: "(unparsed)",
        severity: "error",
        code: "jsonld_parse_error",
        message: `JSON-LD script is not parseable: ${(err as Error).message}`,
      });
    }
  });
  return { docs, parseErrors };
}

/** Human-readable report for test failure output. */
export function formatRichResultIssues(issues: RichResultIssue[]): string {
  if (issues.length === 0) return "no rich-result issues";
  return issues
    .map((i) => `${i.severity === "error" ? "✗" : "⚠"} ${i.source} ${i.path} [${i.type}] ${i.code}: ${i.message}`)
    .join("\n");
}
