import { describe, expect, it } from "vitest";
// @ts-expect-error - plain ESM script without type declarations
import { lintMigrations } from "../../../scripts/supabase-lint-check.mjs";

/**
 * Regression guard: fails the security suite (and therefore the build/CI) if a
 * migration introduces a SECURITY DEFINER function without a pinned
 * search_path / PUBLIC+anon revoke, or a storage policy that is not scoped to
 * its bucket and owner.
 */
describe("supabase security lint", () => {
  const result = lintMigrations() as {
    errors: string[];
    warnings: string[];
    functionsChecked: number;
  };

  it("analyses the migration history", () => {
    expect(result.functionsChecked).toBeGreaterThan(0);
  });

  it("has no SECURITY DEFINER or storage RLS regressions", () => {
    expect(result.errors).toEqual([]);
  });
});
