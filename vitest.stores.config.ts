import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

/** Store snapshot-stability regression suite. */
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    name: "stores",
    environment: "node",
    include: ["src/tests/stores/**/*.test.ts"],
    passWithNoTests: false,
  },
});
