import { SOCIAL_IMAGE_URL, canonicalUrl } from "@/lib/structured-data";

/**
 * Social sharing meta helper.
 *
 * Wraps a route's `head().meta` array and fills in the OpenGraph / Twitter
 * Card tags that are required for a correct link preview but easy to forget:
 *
 *   - `og:type`        defaults to "website" (override per route)
 *   - `twitter:card`   defaults to "summary_large_image"
 *   - `twitter:title`  mirrors `og:title` (or the page title)
 *   - `twitter:description` mirrors `og:description` (or the meta description)
 *   - `twitter:image`  mirrors `og:image` when one is set
 *   - `og:url` / `twitter:url` are normalised through `canonicalUrl()` so both
 *     always match the canonical URL the page (and its JSON-LD) advertises
 *
 * Anything the route already declares is left untouched, so the helper is
 * idempotent and safe to wrap around every route's meta array. The
 * `test:seo:social` build gate validates the result for every route.
 */

export type MetaEntry = Record<string, string>;

export interface SocialMetaOptions {
  /** og:type for this page. Defaults to "website". */
  type?: string;
  /** twitter:card variant. Defaults to "summary_large_image". */
  card?: string;
  /** Absolute https URL for og:url when the route doesn't declare one. */
  url?: string;
  /** Absolute https URL for og:image when the route doesn't declare one. */
  image?: string;
}

const get = (meta: MetaEntry[], key: string) =>
  meta.find((m) => m.property === key || m.name === key)?.content;

const has = (meta: MetaEntry[], key: string) =>
  meta.some((m) => m.property === key || m.name === key);

export function withSocialMeta(meta: MetaEntry[], options: SocialMetaOptions = {}): MetaEntry[] {
  const out = [...meta];
  const title = get(out, "og:title") ?? out.find((m) => m.title)?.title;
  const description = get(out, "og:description") ?? get(out, "description");
  // Every share card needs an image; fall back to the content-hashed site cover.
  const image = get(out, "og:image") ?? options.image ?? SOCIAL_IMAGE_URL;
  if (!has(out, "og:image")) {
    out.push({ property: "og:image", content: image });
    out.push({ property: "og:image:width", content: "1200" });
    out.push({ property: "og:image:height", content: "630" });
  }


  if (!has(out, "og:title") && title) out.push({ property: "og:title", content: title });
  if (!has(out, "og:description") && description)
    out.push({ property: "og:description", content: description });
  if (!has(out, "og:type")) out.push({ property: "og:type", content: options.type ?? "website" });
  // og:url + twitter:url must be the page's canonical URL — the same value
  // used by <link rel="canonical"> and the JSON-LD `url`/`@id` nodes.
  const declaredUrl = get(out, "og:url") ?? options.url;
  const url = declaredUrl ? canonicalUrl(declaredUrl) : undefined;
  if (url) {
    const existing = out.findIndex((m) => m.property === "og:url" || m.name === "og:url");
    if (existing >= 0) out[existing] = { property: "og:url", content: url };
    else out.push({ property: "og:url", content: url });
  }

  if (!has(out, "twitter:card"))
    out.push({ name: "twitter:card", content: options.card ?? "summary_large_image" });
  if (!has(out, "twitter:title") && title) out.push({ name: "twitter:title", content: title });
  if (!has(out, "twitter:description") && description)
    out.push({ name: "twitter:description", content: description });
  if (!has(out, "twitter:image") && image) out.push({ name: "twitter:image", content: image });
  if (url) {
    const existing = out.findIndex((m) => m.name === "twitter:url" || m.property === "twitter:url");
    if (existing >= 0) out[existing] = { name: "twitter:url", content: url };
    else out.push({ name: "twitter:url", content: url });
  }

  return out;
}
