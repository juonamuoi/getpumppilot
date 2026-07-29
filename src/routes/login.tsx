import { createFileRoute, redirect } from "@tanstack/react-router";

/** Alias: /login -> /auth (keeps the ?next= redirect target). */
export const Route = createFileRoute("/login")({
  validateSearch: (s: Record<string, unknown>): { next?: string } =>
    typeof s.next === "string" ? { next: s.next } : {},
  beforeLoad: ({ search }) => {
    throw redirect({ to: "/auth", search, replace: true });
  },
});
