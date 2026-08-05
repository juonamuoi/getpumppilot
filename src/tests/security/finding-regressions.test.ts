import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
// @ts-expect-error - plain ESM script without type declarations
import { lintMigrations } from "../../../scripts/supabase-lint-check.mjs";

/**
 * Automated regression guards for two previously-remediated security findings.
 * These run in `bun run test:security`, which is part of the build/CI pipeline,
 * so CI fails if either finding reappears.
 *
 *   1. open_dex_quote                    — unauthenticated / unthrottled DEX quote endpoint
 *   2. SUPA_function_search_path_mutable — public DB function without a pinned search_path
 */

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("regression: open_dex_quote", () => {
  const src = read("src/lib/dex.functions.ts");

  it("declares the quote server function with the Supabase auth middleware", () => {
    expect(src).toMatch(/requireSupabaseAuth/);
    expect(src).toMatch(
      /export\s+const\s+getSwapQuote\s*=\s*createServerFn\([\s\S]{0,120}?\)\s*\n?\s*\.middleware\(\[\s*requireSupabaseAuth\s*\]\)/,
    );
  });

  it("throttles quotes per authenticated user before calling the aggregator", () => {
    const rateLimitIdx = src.indexOf("checkQuoteRateLimit");
    const upstreamIdx = src.indexOf("api.0x.org");
    expect(rateLimitIdx).toBeGreaterThan(-1);
    expect(upstreamIdx).toBeGreaterThan(-1);
    expect(rateLimitIdx).toBeLessThan(upstreamIdx);
    // The limit must be keyed on the authenticated user, never on client input.
    expect(src).toMatch(/checkQuoteRateLimit\(\s*context\.userId\s*\)/);
  });

  it("keeps a bounded per-user quote budget in the rate limiter", () => {
    const limiter = read("src/lib/quote-rate-limit.server.ts");
    const max = /(?:MAX[A-Z_]*|LIMIT)\s*=\s*(\d+)/.exec(limiter);
    expect(max, "rate limiter must define a numeric budget").not.toBeNull();
    expect(Number(max![1])).toBeGreaterThan(0);
    expect(Number(max![1])).toBeLessThanOrEqual(60);
  });

  it("never exposes an unauthenticated quote server function elsewhere", () => {
    // A second, middleware-free copy of the endpoint would re-open the finding.
    const occurrences = src.match(/createServerFn\(/g) ?? [];
    const middlewares = src.match(/\.middleware\(\[/g) ?? [];
    expect(middlewares.length).toBeGreaterThanOrEqual(occurrences.length);
  });
});

describe("regression: SUPA_function_search_path_mutable", () => {
  const result = lintMigrations() as {
    errors: string[];
    warnings: string[];
    functionsChecked: number;
  };

  it("analyses every function in the migration history", () => {
    expect(result.functionsChecked).toBeGreaterThan(0);
  });

  it("has no public function with a mutable search_path", () => {
    const offenders = result.errors.filter((e) => /search_path/i.test(e));
    expect(offenders).toEqual([]);
  });

  it("reports a mutable search_path when one is introduced", () => {
    const bad = lintMigrations([
      {
        name: "9999_regression.sql",
        sql: `CREATE OR REPLACE FUNCTION public.regress_probe()
RETURNS TRIGGER LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END; $$;`,
      },
    ]) as { errors: string[] };
    expect(bad.errors.some((e) => /regress_probe[\s\S]*search_path/i.test(e))).toBe(true);
  });
});
