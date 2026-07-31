import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { buildAtom, feedResponse } from "@/lib/feed";

export const Route = createFileRoute("/atom.xml")({
  server: {
    handlers: {
      GET: async () => feedResponse(buildAtom(), "application/atom+xml"),
    },
  },
});
