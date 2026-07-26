import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

/**
 * Security regression suite.
 * Runs on every build (see the `build` / `build:dev` scripts in package.json).
 */
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    name: "security",
    environment: "node",
    include: ["src/tests/security/**/*.test.ts"],
    passWithNoTests: false,
    coverage: {
      provider: "v8",
      reportsDirectory: "coverage/security",
      reporter: ["text-summary", "json-summary", "json", "html"],
      include: [
        "src/lib/go-live-session.server.ts",
        "src/lib/payments-validation.ts",
        "src/lib/stripe-customer.server.ts",
      ],
      all: true,
    },
  },

});
