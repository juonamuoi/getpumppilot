import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";

import {
  checkSocialTags,
  formatSocialIssues,
  parseSocialTagsFromHtml,
} from "@/lib/social-tags-validate";

/**
 * End-to-end social preview card guard.
 *
 * Unlike social-tags.test.ts (which calls `head()` in isolation), this suite
 * renders each key route through the real SSR server, extracts the exact
 * OpenGraph / Twitter Card a scraper would build, and compares it against a
 * committed baseline. Any drift — a changed title, description, image hash,
 * card type or URL — fails the test.
 *
 * Intentional changes: re-record with
 *   UPDATE_SOCIAL_CARDS=1 bun run test:seo:cards
 * and commit the updated baseline + regenerated preview gallery.
 */

const BASE_URL = (process.env.SEO_E2E_BASE_URL ?? "http://localhost:8080").replace(/\/$/, "");
const UPDATE = process.env.UPDATE_SOCIAL_CARDS === "1";
const BASELINE = resolve(process.cwd(), "src/tests/seo/social-cards.baseline.json");
const GALLERY = resolve(process.cwd(), "test-artifacts/social-cards.html");

/** Routes whose share cards are public-facing and must stay stable. */
const KEY_ROUTES = [
  "/",
  "/pricing",
  "/blog",
  "/blog/best-ai-investment-app-2026",
  "/blog/pumppilot-vs-autopilot-comparison",
  "/blog/pumppilot-vs-tradingview-paper-trading",
  "/asset/btc",
  "/asset/eth",
  "/scanner",
  "/alerts",
  "/learn",
  "/developers",
  "/community",
  "/refer",
  "/auth",
];

export interface SocialCard {
  path: string;
  title: string;
  ogTitle: string;
  ogDescription: string;
  ogType: string;
  ogUrl: string;
  ogImage: string;
  ogSiteName: string;
  twitterCard: string;
  twitterTitle: string;
  twitterDescription: string;
  twitterImage: string;
  canonical: string;
}

function cardFrom(path: string, html: string): SocialCard {
  const set = parseSocialTagsFromHtml(html, path, path);
  const canonical =
    /<link[^>]+rel=["']canonical["'][^>]*>/i
      .exec(html)?.[0]
      ?.match(/href=["']([^"']+)["']/i)?.[1] ?? "";
  const t = set.tags;
  return {
    path,
    title: set.title ?? "",
    ogTitle: t["og:title"] ?? "",
    ogDescription: t["og:description"] ?? "",
    ogType: t["og:type"] ?? "",
    ogUrl: t["og:url"] ?? "",
    ogImage: t["og:image"] ?? "",
    ogSiteName: t["og:site_name"] ?? "",
    twitterCard: t["twitter:card"] ?? "",
    twitterTitle: t["twitter:title"] ?? "",
    twitterDescription: t["twitter:description"] ?? "",
    twitterImage: t["twitter:image"] ?? "",
    canonical,
  };
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

/** Renders the captured cards as a visual gallery for manual review. */
function renderGallery(cards: SocialCard[]) {
  const items = cards
    .map(
      (c) => `<figure class="card">
    <img src="${escapeHtml(c.ogImage)}" alt="Social preview for ${escapeHtml(c.path)}" loading="lazy" />
    <figcaption>
      <span class="host">getpumppilot.app</span>
      <strong>${escapeHtml(c.ogTitle)}</strong>
      <p>${escapeHtml(c.ogDescription)}</p>
      <code>${escapeHtml(c.path)} · ${escapeHtml(c.twitterCard)} · ${escapeHtml(c.ogType)}</code>
    </figcaption>
  </figure>`,
    )
    .join("\n");
  return `<!doctype html><meta charset="utf-8"><title>PumpPilot AI — social preview cards</title>
<style>
body{background:#0b0f19;color:#e6edf6;font:14px/1.5 system-ui,sans-serif;padding:32px;margin:0}
h1{font-size:20px;margin:0 0 24px}
.grid{display:grid;gap:24px;grid-template-columns:repeat(auto-fill,minmax(360px,1fr))}
.card{margin:0;background:#121826;border:1px solid #1f2937;border-radius:12px;overflow:hidden}
.card img{width:100%;aspect-ratio:1200/630;object-fit:cover;background:#0b0f19;display:block}
figcaption{padding:12px 14px}
.host{color:#8ea0b8;text-transform:uppercase;font-size:11px;letter-spacing:.06em}
strong{display:block;margin:4px 0}
p{color:#a9b6c8;margin:0 0 8px}
code{color:#5eead4;font-size:11px}
</style>
<h1>Social preview cards (${cards.length} key routes)</h1>
<div class="grid">
${items}
</div>`;
}

async function ping(url: string) {
  try {
    const res = await fetch(url, { headers: { accept: "text/html" } });
    return res.ok || res.status === 404;
  } catch {
    return false;
  }
}

let server: ChildProcess | null = null;
let base = BASE_URL;
const rendered = new Map<string, SocialCard>();

beforeAll(async () => {
  if (!(await ping(base))) {
    // No SSR server running (fresh CI checkout) — boot one for the suite.
    const port = 43117;
    base = `http://localhost:${port}`;
    server = spawn("npx", ["vite", "dev", "--port", String(port), "--host", "127.0.0.1"], {
      stdio: "ignore",
      env: process.env,
    });
    const deadline = Date.now() + 90_000;
    while (Date.now() < deadline) {
      if (await ping(base)) break;
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  expect(await ping(base), `no SSR server reachable at ${base}`).toBe(true);

  for (const path of KEY_ROUTES) {
    const res = await fetch(`${base}${path}`, { headers: { accept: "text/html" } });
    expect(res.status, `GET ${path}`).toBe(200);
    rendered.set(path, cardFrom(path, await res.text()));
  }
}, 180_000);

afterAll(() => {
  server?.kill("SIGTERM");
});

describe("social preview cards (e2e)", () => {
  it("renders a share card for every key route", () => {
    expect(rendered.size).toBe(KEY_ROUTES.length);
    for (const path of KEY_ROUTES) {
      const card = rendered.get(path)!;
      expect(card.ogTitle, `${path} og:title`).not.toBe("");
      expect(card.ogDescription, `${path} og:description`).not.toBe("");
      expect(card.ogImage, `${path} og:image`).toMatch(/^https:\/\//);
      expect(card.twitterImage, `${path} twitter:image`).toBe(card.ogImage);
      expect(card.canonical, `${path} canonical`).toBe(card.ogUrl);
    }
  });

  it("emits valid OpenGraph / Twitter tags on every key route", () => {
    const issues = KEY_ROUTES.flatMap((path) => {
      const card = rendered.get(path)!;
      return checkSocialTags({
        id: path,
        path,
        title: card.title,
        tags: {
          "og:title": card.ogTitle,
          "og:description": card.ogDescription,
          "og:type": card.ogType,
          "og:url": card.ogUrl,
          "og:image": card.ogImage,
          "twitter:card": card.twitterCard,
          "twitter:title": card.twitterTitle,
          "twitter:description": card.twitterDescription,
          "twitter:image": card.twitterImage,
        },
      });
    });
    expect(issues, formatSocialIssues(issues)).toEqual([]);
  });

  it("matches the recorded card baseline (no unreviewed drift)", () => {
    const current = KEY_ROUTES.map((path) => rendered.get(path)!);

    if (UPDATE || !existsSync(BASELINE)) {
      writeFileSync(BASELINE, `${JSON.stringify(current, null, 2)}\n`);
      mkdirSync(dirname(GALLERY), { recursive: true });
      writeFileSync(GALLERY, renderGallery(current));
      expect(existsSync(BASELINE)).toBe(true);
      return;
    }

    const baseline: SocialCard[] = JSON.parse(readFileSync(BASELINE, "utf8"));
    const byPath = new Map(baseline.map((c) => [c.path, c]));
    const drift: string[] = [];

    for (const card of current) {
      const before = byPath.get(card.path);
      if (!before) {
        drift.push(`${card.path}: new route with no recorded card`);
        continue;
      }
      for (const key of Object.keys(card) as (keyof SocialCard)[]) {
        if (card[key] !== before[key]) {
          drift.push(`${card.path} · ${key}\n    before: ${before[key]}\n    after:  ${card[key]}`);
        }
      }
    }
    for (const stale of baseline) {
      if (!current.some((c) => c.path === stale.path)) {
        drift.push(`${stale.path}: recorded card no longer rendered`);
      }
    }

    expect(
      drift,
      `Social preview cards drifted:\n${drift.join("\n")}\n\nIf intentional, re-record with UPDATE_SOCIAL_CARDS=1 bun run test:seo:cards`,
    ).toEqual([]);
  });
});
