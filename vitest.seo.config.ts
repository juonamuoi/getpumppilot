import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

/**
 * SEO / structured-data regression suite.
 *
 * Loads every page route, invokes its `head()` and validates each emitted
 * JSON-LD block (valid JSON, required schema.org fields, absolute
 * same-origin URLs). Run in CI via `bun run test:seo`.
 */
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    name: "seo",
    environment: "node",
    include: ["src/tests/seo/**/*.test.ts"],
    passWithNoTests: false,
  },
});
