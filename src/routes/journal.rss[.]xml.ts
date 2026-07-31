import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { buildRss, feedResponse } from "@/lib/feed";

export const Route = createFileRoute("/journal/rss.xml")({
  server: {
    handlers: {
      GET: async () => feedResponse(buildRss(), "application/rss+xml"),
    },
  },
});
