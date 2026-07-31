import { canonicalLinks } from "@/lib/structured-data";
import { withSocialMeta } from "@/lib/social-meta";
import { createFileRoute, redirect } from "@tanstack/react-router";

/** Alias: /login -> /auth (keeps the ?next= redirect target). */
export const Route = createFileRoute("/login")({
  head: () => ({
    meta: withSocialMeta(
      [
        { title: "Login | PumpPilot AI" },
        {
          name: "description",
          content: "Login on PumpPilot AI — spot momentum, control risk, trade smarter with live market data and read-only wallet insight.",
        },
        { property: "og:title", content: "Login" },
        {
          property: "og:description",
          content: "Login on PumpPilot AI — spot momentum, control risk, trade smarter with live market data and read-only wallet insight.",
        },
        { property: "og:type", content: "website" },
      ],
      { url: "https://www.getpumppilot.app/login" },
    ),
    links: canonicalLinks("/login"),
  }),
  validateSearch: (s: Record<string, unknown>): { next?: string } =>
    typeof s.next === "string" ? { next: s.next } : {},
  beforeLoad: ({ search }) => {
    throw redirect({ to: "/auth", search, replace: true });
  },
});
