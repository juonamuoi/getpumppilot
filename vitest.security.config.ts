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
  },
});
