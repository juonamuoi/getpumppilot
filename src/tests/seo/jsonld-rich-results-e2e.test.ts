import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { validateJsonLd, type JsonLdIssue } from "@/lib/jsonld-validate";
import {
  checkRichResults,
  extractJsonLdBlocks,
  formatRichResultIssues,
  parseJsonLdBlocks,
  type RichResultReport,
} from "@/lib/jsonld-rich-results";

/**
 * Rich-result eligibility guard (e2e / CI).
 *
 * Renders every public route through the real SSR server — exactly what
 * Googlebot fetches — then for each `application/ld+json` block:
 *
 *   1. asserts the script parses as JSON,
 *   2. runs the structural validator (@context/@type/required fields/URLs),
 *   3. runs Google's rich-result eligibility signals per @type
 *      (headline length, ISO dates, publisher logo, breadcrumb ordering,
 *      FAQ answers, SearchAction query-input, offers/currency, …).
 *
 * Errors fail the build; warnings are written to
 * test-artifacts/jsonld-rich-results.json for review.
 */

const BASE_URL = (process.env.SEO_E2E_BASE_URL ?? "http://localhost:8080").replace(/\/$/, "");
const REPORT = resolve(process.cwd(), "test-artifacts/jsonld-rich-results.json");

/** Public routes that carry structured data. */
const ROUTES = [
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
  "/privacy",
  "/terms",
];

type PageLd = {
  path: string;
  blocks: string[];
  docs: unknown[];
  parseErrors: ReturnType<typeof parseJsonLdBlocks>["parseErrors"];
  structural: JsonLdIssue[];
  rich: RichResultReport;
};

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
const pages = new Map<string, PageLd>();

beforeAll(async () => {
  if (!(await ping(base))) {
    const port = 43119;
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

  for (const path of ROUTES) {
    const res = await fetch(`${base}${path}`, { headers: { accept: "text/html" } });
    expect(res.status, `GET ${path}`).toBe(200);
    const html = await res.text();
    const blocks = extractJsonLdBlocks(html);
    const { docs, parseErrors } = parseJsonLdBlocks(blocks, path);
    const structural = docs.flatMap((doc, i) => validateJsonLd(doc, `${path} script[${i}]`));
    pages.set(path, {
      path,
      blocks,
      docs,
      parseErrors,
      structural,
      rich: checkRichResults(docs, path),
    });
  }

  mkdirSync(dirname(REPORT), { recursive: true });
  writeFileSync(
    REPORT,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        base,
        pages: [...pages.values()].map((p) => ({
          path: p.path,
          scripts: p.blocks.length,
          types: p.rich.types,
          errors: p.rich.errors,
          warnings: p.rich.warnings,
          structuralIssues: p.structural,
        })),
      },
      null,
      2,
    ),
  );
}, 180_000);

afterAll(() => {
  server?.kill("SIGTERM");
});

describe("JSON-LD rich results (e2e)", () => {
  it("renders every checked route", () => {
    expect(pages.size).toBe(ROUTES.length);
  });

  it("emits at least one JSON-LD block per route", () => {
    const empty = [...pages.values()].filter((p) => p.blocks.length === 0).map((p) => p.path);
    expect(empty, `routes without structured data: ${empty.join(", ")}`).toEqual([]);
  });

  it.each(ROUTES)("%s serves parseable JSON-LD", (path) => {
    const page = pages.get(path)!;
    expect(page.parseErrors, formatRichResultIssues(page.parseErrors)).toEqual([]);
    expect(page.docs.length).toBe(page.blocks.length);
  });

  it.each(ROUTES)("%s JSON-LD is structurally valid", (path) => {
    const page = pages.get(path)!;
    const detail = page.structural.map((i) => `✗ ${i.path}: ${i.message}`).join("\n");
    expect(page.structural, detail).toEqual([]);
  });

  it.each(ROUTES)("%s meets Google rich-result eligibility signals", (path) => {
    const page = pages.get(path)!;
    expect(page.rich.errors, formatRichResultIssues(page.rich.errors)).toEqual([]);
  });

  it("covers the rich-result types the site relies on", () => {
    const all = new Set([...pages.values()].flatMap((p) => p.rich.types));
    for (const required of ["Organization", "WebSite", "BlogPosting", "BreadcrumbList"]) {
      expect([...all], `${required} JSON-LD is not emitted anywhere`).toContain(required);
    }
  });
});
