/**
 * OpenGraph + Twitter Card validator (shared by the SEO test suite and the
 * pre-deploy build check in scripts/social-tags-build-check.mjs).
 *
 * Validates the social sharing tags a route emits from `head()`, or the tags
 * parsed out of rendered HTML:
 *   - required tags present (og:title, og:description, og:type, og:url,
 *     twitter:card, twitter:title, twitter:description)
 *   - non-empty, non-placeholder content within sane length bounds
 *   - og:url absolute, https, on the canonical origin and self-referencing
 *   - og:type / twitter:card from the allowed vocabulary
 *   - og:image / twitter:image absolute https URLs when present, with
 *     twitter:image matching og:image
 *   - og:title / twitter:title consistent with the page <title>
 */

import { CANONICAL_ORIGIN, toPathname } from "@/lib/sitemap-canonical-validate";

export { CANONICAL_ORIGIN };

export type SocialIssueCode =
  | "missing_tag"
  | "empty_tag"
  | "placeholder_content"
  | "too_long"
  | "too_short"
  | "duplicate_tag"
  | "bad_og_type"
  | "bad_twitter_card"
  | "og_url_relative"
  | "og_url_insecure"
  | "og_url_foreign_origin"
  | "og_url_mismatch"
  | "twitter_url_mismatch"
  | "image_relative"
  | "image_insecure"
  | "image_mismatch"
  | "title_mismatch";

export interface SocialIssue {
  code: SocialIssueCode;
  id: string;
  tag: string;
  message: string;
}

/** One route/document's social tags, normalised to a flat map. */
export interface SocialTagSet {
  /** Human-readable identifier (route file + params, or HTML file name). */
  id: string;
  /** Pathname the document is served at, used to verify og:url self-reference. */
  path?: string;
  /** Document <title>, when known. */
  title?: string;
  /** Tag name/property -> content. */
  tags: Record<string, string>;
  /** Tags that appeared more than once. */
  duplicates?: string[];
  /** Skip validation (e.g. noindex admin routes). */
  noindex?: boolean;
}

export const REQUIRED_TAGS = [
  "og:title",
  "og:description",
  "og:type",
  "og:url",
  "twitter:card",
  "twitter:title",
  "twitter:description",
  "twitter:url",
] as const;

export const ALLOWED_OG_TYPES = [
  "website",
  "article",
  "product",
  "profile",
  "book",
  "video.other",
];

export const ALLOWED_TWITTER_CARDS = ["summary", "summary_large_image", "app", "player"];

const PLACEHOLDER = /^(lovable app|lovable generated project|untitled|todo|tbd|your (site|app|title)|example)\b/i;

const LIMITS: Record<string, { min: number; max: number }> = {
  "og:title": { min: 10, max: 95 },
  "twitter:title": { min: 10, max: 95 },
  "og:description": { min: 40, max: 200 },
  "twitter:description": { min: 40, max: 200 },
};

const issue = (code: SocialIssueCode, id: string, tag: string, message: string): SocialIssue => ({
  code,
  id,
  tag,
  message,
});

function checkAbsoluteImage(set: SocialTagSet, tag: string, out: SocialIssue[]) {
  const value = set.tags[tag];
  if (!value) return;
  if (!/^https?:\/\//i.test(value)) {
    out.push(issue("image_relative", set.id, tag, `must be an absolute URL, got "${value}"`));
    return;
  }
  if (value.startsWith("http://")) {
    out.push(issue("image_insecure", set.id, tag, `must use https, got "${value}"`));
  }
}

/** Validates one document's social tags. Returns [] when everything is sound. */
export function checkSocialTags(set: SocialTagSet): SocialIssue[] {
  const out: SocialIssue[] = [];
  if (set.noindex) return out;

  for (const tag of REQUIRED_TAGS) {
    const value = set.tags[tag];
    if (value === undefined) {
      out.push(issue("missing_tag", set.id, tag, "tag is not emitted"));
      continue;
    }
    if (!value.trim()) {
      out.push(issue("empty_tag", set.id, tag, "tag content is empty"));
      continue;
    }
    if (PLACEHOLDER.test(value.trim())) {
      out.push(issue("placeholder_content", set.id, tag, `placeholder content "${value}"`));
    }
    const limit = LIMITS[tag];
    if (limit) {
      const len = value.trim().length;
      if (len > limit.max)
        out.push(issue("too_long", set.id, tag, `${len} chars, max ${limit.max}`));
      else if (len < limit.min)
        out.push(issue("too_short", set.id, tag, `${len} chars, min ${limit.min}`));
    }
  }

  for (const tag of set.duplicates ?? []) {
    out.push(issue("duplicate_tag", set.id, tag, "tag is emitted more than once"));
  }

  const ogType = set.tags["og:type"];
  if (ogType && !ALLOWED_OG_TYPES.includes(ogType.trim())) {
    out.push(
      issue("bad_og_type", set.id, "og:type", `"${ogType}" is not one of ${ALLOWED_OG_TYPES.join(", ")}`),
    );
  }

  const card = set.tags["twitter:card"];
  if (card && !ALLOWED_TWITTER_CARDS.includes(card.trim())) {
    out.push(
      issue(
        "bad_twitter_card",
        set.id,
        "twitter:card",
        `"${card}" is not one of ${ALLOWED_TWITTER_CARDS.join(", ")}`,
      ),
    );
  }

  const ogUrl = set.tags["og:url"]?.trim();
  if (ogUrl) {
    if (!/^https?:\/\//i.test(ogUrl)) {
      out.push(issue("og_url_relative", set.id, "og:url", `must be absolute, got "${ogUrl}"`));
    } else if (ogUrl.startsWith("http://")) {
      out.push(issue("og_url_insecure", set.id, "og:url", `must use https, got "${ogUrl}"`));
    } else if (!ogUrl.startsWith(`${CANONICAL_ORIGIN}/`) && ogUrl !== CANONICAL_ORIGIN) {
      out.push(
        issue("og_url_foreign_origin", set.id, "og:url", `must be on ${CANONICAL_ORIGIN}, got "${ogUrl}"`),
      );
    } else if (set.path) {
      const got = toPathname(ogUrl);
      const want = set.path.length > 1 ? set.path.replace(/\/+$/, "") : "/";
      if (got !== want) {
        out.push(
          issue("og_url_mismatch", set.id, "og:url", `points at "${got}" but the page is "${want}"`),
        );
      }
    }
  }

  const twUrl = set.tags["twitter:url"]?.trim();
  if (ogUrl && twUrl && ogUrl !== twUrl) {
    out.push(
      issue(
        "twitter_url_mismatch",
        set.id,
        "twitter:url",
        `"${twUrl}" does not match og:url "${ogUrl}" — the canonical URL must be identical`,
      ),
    );
  }

  checkAbsoluteImage(set, "og:image", out);
  checkAbsoluteImage(set, "twitter:image", out);
  const ogImage = set.tags["og:image"];
  const twImage = set.tags["twitter:image"];
  if (ogImage && twImage && ogImage.trim() !== twImage.trim()) {
    out.push(
      issue("image_mismatch", set.id, "twitter:image", "does not match og:image — previews will differ"),
    );
  }

  const ogTitle = set.tags["og:title"]?.trim();
  const twTitle = set.tags["twitter:title"]?.trim();
  if (ogTitle && twTitle && ogTitle !== twTitle) {
    out.push(
      issue("title_mismatch", set.id, "twitter:title", `"${twTitle}" differs from og:title "${ogTitle}"`),
    );
  }

  return out;
}

/** Formats issues for a failing test / CI log. */
export function formatSocialIssues(issues: SocialIssue[]): string {
  if (issues.length === 0) return "no social tag issues";
  return issues.map((i) => `  ✗ ${i.id} [${i.tag}] ${i.code}: ${i.message}`).join("\n");
}

const META_RE = /<meta\b[^>]*>/gi;
const ATTR_RE = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g;

function decodeEntities(raw: string) {
  return raw
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&apos;/g, "'")
    .replace(/&#x2F;/g, "/")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

/** Extracts og:* / twitter:* tags (and <title>) from rendered HTML. */
export function parseSocialTagsFromHtml(html: string, id: string, path?: string): SocialTagSet {
  const tags: Record<string, string> = {};
  const seen = new Set<string>();
  const duplicates: string[] = [];
  let noindex = false;

  for (const [raw] of html.matchAll(META_RE)) {
    const attrs: Record<string, string> = {};
    for (const m of raw.matchAll(ATTR_RE)) {
      attrs[m[1].toLowerCase()] = decodeEntities(m[2] ?? m[3] ?? m[4] ?? "");
    }
    const key = (attrs.property || attrs.name || "").toLowerCase();
    if (!key) continue;
    if (key === "robots" && /noindex/i.test(attrs.content ?? "")) noindex = true;
    if (!key.startsWith("og:") && !key.startsWith("twitter:")) continue;
    if (seen.has(key) && tags[key] !== (attrs.content ?? "")) duplicates.push(key);
    seen.add(key);
    tags[key] = attrs.content ?? "";
  }

  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1];
  return {
    id,
    path,
    title: title ? decodeEntities(title).trim() : undefined,
    tags,
    duplicates: [...new Set(duplicates)],
    noindex,
  };
}
