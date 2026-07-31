import { spawn } from "node:child_process";
import type { Plugin } from "vite";

/**
 * Dev-time SEO auto-refresh.
 *
 * Watches `src/routes/**.tsx`. When a route file is added or removed, it
 * re-runs the two generators that derive their output from the route tree:
 *
 *   scripts/route-seo-sync.mjs  -> scaffolds OG/Twitter/canonical metadata
 *   scripts/gen-sitemap.mjs     -> rewrites the split sitemap set
 *
 * So adding something like `src/routes/quests.tsx` immediately lands in
 * public/sitemap*.xml and ships share metadata without a manual step. The
 * same scripts run in `--check` mode in CI and unconditionally at build time.
 */
function run(script: string) {
  const child = spawn(process.execPath, [script], { stdio: "inherit" });
  return new Promise<void>((res) => child.on("close", () => res()));
}

export function routeSeoSync(): Plugin {
  let pending: NodeJS.Timeout | null = null;
  const refresh = () => {
    if (pending) clearTimeout(pending);
    pending = setTimeout(async () => {
      pending = null;
      await run("scripts/route-seo-sync.mjs");
      await run("scripts/gen-sitemap.mjs");
    }, 300);
  };

  return {
    name: "pumppilot:route-seo-sync",
    apply: "serve",
    configureServer(server) {
      const isRoute = (file: string) =>
        file.replace(/\\/g, "/").includes("/src/routes/") && file.endsWith(".tsx");
      server.watcher.on("add", (file) => isRoute(file) && refresh());
      server.watcher.on("unlink", (file) => isRoute(file) && refresh());
    },
  };
}
