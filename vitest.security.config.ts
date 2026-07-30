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
        "src/lib/mcp/audit.ts",
        "src/lib/admin-guard.ts",
        "src/lib/request-context.server.ts",
        "src/lib/storage-audit.server.ts",
        "src/lib/storage-audit-export.server.ts",
      ],
      all: true,
    },
  },

});
