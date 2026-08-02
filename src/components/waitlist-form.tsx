import { useState } from "react";
import { Loader2, Mail, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getUtmContext } from "@/lib/funnel";

type State = "idle" | "loading" | "done" | "error";

export function WaitlistForm({ source = "landing" }: { source?: string }) {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<State>("idle");
  const [message, setMessage] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) || value.length > 255) {
      setState("error");
      setMessage("Please enter a valid email address.");
      return;
    }
    setState("loading");
    try {
      const utm = (() => {
        try {
          return getUtmContext?.() ?? {};
        } catch {
          return {};
        }
      })() as Record<string, string | undefined>;

      const res = await fetch("/api/public/waitlist", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: value,
          source,
          utm_source: utm.utm_source,
          utm_medium: utm.utm_medium,
          utm_campaign: utm.utm_campaign,
        }),
      });
      const data = (await res.json()) as { ok: boolean; alreadyJoined?: boolean };
      if (!res.ok || !data.ok) throw new Error("failed");
      setState("done");
      setMessage(
        data.alreadyJoined
          ? "You're already on the list — we'll be in touch."
          : "You're on the list. Check your inbox for a confirmation.",
      );
    } catch {
      setState("error");
      setMessage("Something went wrong. Please try again.");
    }
  };

  if (state === "done") {
    return (
      <div className="mx-auto flex max-w-md items-center justify-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
        <Check className="h-4 w-4" /> {message}
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="mx-auto max-w-md">
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          id="signup-email"
          type="email"
          inputMode="email"
          autoComplete="email"
          maxLength={255}
          placeholder="you@example.com"
          aria-label="Email address"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="flex-1"
        />
        <Button type="submit" disabled={state === "loading"}>
          {state === "loading" ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Mail className="mr-2 h-4 w-4" />
          )}
          Join the waitlist
        </Button>
      </div>
      <p
        className={`mt-2 text-xs ${
          state === "error" ? "text-destructive" : "text-muted-foreground"
        }`}
      >
        {state === "error"
          ? message
          : "One confirmation email, then an occasional product update. No spam, unsubscribe anytime."}
      </p>
    </form>
  );
}
