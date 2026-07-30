import { describe, expect, it } from "vitest";
import { BLOG_POSTS } from "@/lib/blog-posts";
import { ASSETS } from "@/lib/mock-data";
import {
  CANONICAL_ORIGIN,
  REQUIRED_TAGS,
  checkSocialTags,
  formatSocialIssues,
  parseSocialTagsFromHtml,
  type SocialTagSet,
} from "@/lib/social-tags-validate";

/**
 * OpenGraph / Twitter Card guard (CI, pre-deploy).
 *
 * Loads every page route, invokes head() the way TanStack Router does and
 * validates the social sharing tags it emits. Runs before every build via
 * `bun run test:seo:social` (wired into the `build` script).
 */

const routeModules = import.meta.glob("/src/routes/**/*.tsx");

const SAMPLE_PARAMS: Record<string, string> = {
  symbol: "btc",
  slug: "pumppilot-vs-autopilot-comparison",
  variant: "momentum-scanner",
  $: "sample",
};

/** Non-HTML or internal routes with no share surface. */
const SKIP = [/\/routes\/api\//, /\/routes\/\[/, /__root\.tsx$/, /embed\./];

const DYNAMIC_VALUES: Record<string, string[]> = {
  slug: BLOG_POSTS.map((p) => p.slug),
  symbol: ASSETS.map((a) => a.symbol.toLowerCase()),
};

type HeadMeta = Record<string, string>;
type HeadFn = (ctx: { params: Record<string, string>; loaderData: unknown; match: unknown }) =>
  | { meta?: HeadMeta[]; links?: Array<{ rel?: string; href?: string }> }
  | undefined;
type RouteOptions = { head?: HeadFn; loader?: (ctx: { params: Record<string, string> }) => unknown };

function paramSetsFor(id: string): Record<string, string>[] {
  const keys = [...id.matchAll(/\$([a-zA-Z0-9_]*)/g)].map((m) => m[1] || "$");
  let sets: Record<string, string>[] = [{}];
  for (const key of keys) {
    const values = DYNAMIC_VALUES[key] ?? [SAMPLE_PARAMS[key] ?? "sample"];
    sets = sets.flatMap((base) => values.map((value) => ({ ...base, [key]: value })));
  }
  return sets;
}

function pathFor(id: string, params: Record<string, string>) {
  let path = id.replace("/src/routes/", "").replace(/\.tsx$/, "");
  path = path.replace(/\.index$/, "").replace(/^index$/, "");
  path = path.split(".").join("/");
  path = "/" + path.replace(/^\/+/, "");
  path = path.replace(/\$([a-zA-Z0-9_]*)/g, (_m, key: string) => params[key || "$"] ?? "sample");
  return path.length > 1 ? path.replace(/\/+$/, "") : "/";
}

async function loaderDataFor(options: RouteOptions | undefined, params: Record<string, string>) {
  if (typeof options?.loader !== "function") return undefined;
  try {
    return await Promise.race([
      Promise.resolve(options.loader({ params })),
      new Promise((r) => setTimeout(() => r(undefined), 1500)),
    ]);
  } catch {
    return undefined;
  }
}

const routeFiles = Object.keys(routeModules)
  .filter((p) => !SKIP.some((re) => re.test(p)))
  .sort();

let cached: Promise<SocialTagSet[]> | null = null;

function collectSocialTags(): Promise<SocialTagSet[]> {
  cached ??= (async () => {
    const out: SocialTagSet[] = [];
    for (const file of routeFiles) {
      const mod = (await routeModules[file]()) as { Route?: { options?: RouteOptions } };
      const options = mod.Route?.options;
      if (typeof options?.head !== "function") continue;
      for (const params of paramSetsFor(file)) {
        const loaderData = await loaderDataFor(options, params);
        const head = options.head({ params, loaderData, match: {} }) ?? {};
        const tags: Record<string, string> = {};
        const seen = new Set<string>();
        const duplicates: string[] = [];
        let title: string | undefined;
        let noindex = false;
        for (const entry of head.meta ?? []) {
          if (entry.title) title = entry.title;
          const key = (entry.property ?? entry.name ?? "").toLowerCase();
          if (!key) continue;
          if (key === "robots" && /noindex/i.test(entry.content ?? "")) noindex = true;
          if (!key.startsWith("og:") && !key.startsWith("twitter:")) continue;
          if (seen.has(key) && tags[key] !== (entry.content ?? "")) duplicates.push(key);
          seen.add(key);
          tags[key] = entry.content ?? "";
        }
        out.push({
          id: `${file} ${JSON.stringify(params)}`,
          path: pathFor(file, params),
          title,
          tags,
          duplicates: [...new Set(duplicates)],
          noindex,
        });
      }
    }
    return out;
  })();
  return cached;
}

describe("OpenGraph + Twitter Card validation", () => {
  it("finds page routes that emit head metadata", async () => {
    const sets = await collectSocialTags();
    expect(sets.length).toBeGreaterThan(10);
  });

  it("every indexable route emits valid OG and Twitter tags", async () => {
    const sets = await collectSocialTags();
    const issues = sets.flatMap(checkSocialTags);
    expect(issues, `\n${formatSocialIssues(issues)}\n`).toEqual([]);
  });

  it("no indexable route is missing a required social tag", async () => {
    const sets = await collectSocialTags();
    const missing = sets
      .filter((s) => !s.noindex)
      .flatMap((s) => REQUIRED_TAGS.filter((t) => !s.tags[t]).map((t) => `${s.path} -> ${t}`));
    expect(missing, `\n${missing.join("\n")}\n`).toEqual([]);
  });

  it("catches malformed tags", () => {
    const base = {
      id: "x",
      path: "/pricing",
      tags: {
        "og:title": "PumpPilot AI pricing and credit packs",
        "og:description":
          "Pay as you go with credits — no subscription. Compare credit packs for the momentum scanner.",
        "og:type": "website",
        "og:url": `${CANONICAL_ORIGIN}/pricing`,
        "twitter:card": "summary_large_image",
        "twitter:title": "PumpPilot AI pricing and credit packs",
        "twitter:description":
          "Pay as you go with credits — no subscription. Compare credit packs for the momentum scanner.",
      },
    } satisfies SocialTagSet;

    expect(checkSocialTags(base)).toEqual([]);
    expect(
      checkSocialTags({ ...base, tags: { ...base.tags, "og:url": `${CANONICAL_ORIGIN}/other` } })[0].code,
    ).toBe("og_url_mismatch");
    expect(
      checkSocialTags({ ...base, tags: { ...base.tags, "og:url": "/pricing" } })[0].code,
    ).toBe("og_url_relative");
    expect(
      checkSocialTags({ ...base, tags: { ...base.tags, "twitter:card": "big" } })[0].code,
    ).toBe("bad_twitter_card");
    expect(checkSocialTags({ ...base, tags: { ...base.tags, "og:type": "page" } })[0].code).toBe(
      "bad_og_type",
    );
    expect(
      checkSocialTags({ ...base, tags: { ...base.tags, "og:image": "/og.png" } })[0].code,
    ).toBe("image_relative");
    expect(
      checkSocialTags({
        ...base,
        tags: { ...base.tags, "og:image": "https://a/og.png", "twitter:image": "https://a/b.png" },
      })[0].code,
    ).toBe("image_mismatch");
    const removed = { ...base.tags } as Record<string, string>;
    delete removed["og:description"];
    expect(checkSocialTags({ ...base, tags: removed })[0].code).toBe("missing_tag");
    expect(checkSocialTags({ ...base, noindex: true, tags: removed })).toEqual([]);
  });

  it("parses social tags out of rendered HTML", () => {
    const set = parseSocialTagsFromHtml(
      `<html><head><title>Hi</title>
       <meta property="og:title" content="A &amp; B" />
       <meta name="twitter:card" content="summary_large_image">
       </head></html>`,
      "sample.html",
      "/",
    );
    expect(set.tags["og:title"]).toBe("A & B");
    expect(set.tags["twitter:card"]).toBe("summary_large_image");
    expect(set.title).toBe("Hi");
  });
});
