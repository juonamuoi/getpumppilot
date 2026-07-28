import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ArrowRight, Loader2, Mail } from "lucide-react";
import { z } from "zod";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { captureUtmFromUrl, getUtmContext } from "@/lib/funnel";
import { getVisitorId } from "@/lib/ad-creatives";

const leadSchema = z.object({
  email: z
    .string()
    .trim()
    .min(5, { message: "Enter your email address" })
    .max(254, { message: "Email is too long" })
    .email({ message: "Enter a valid email address" }),
  consent: z.literal(true, {
    message: "Please tick the consent box to continue",
  }),

});

export type LeadCaptureContext = {
  variant: string;
  placement: string;
};

/**
 * Optional lead capture shown before a visitor starts free. Skipping is
 * always allowed — the CTA still works without an email.
 */
export function LeadCaptureDialog({
  open,
  onOpenChange,
  context,
  destination,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  context: LeadCaptureContext;
  destination: string;
}) {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const go = () => {
    onOpenChange(false);
    void navigate({ to: destination });
  };

  const submit = async () => {
    const parsed = leadSchema.safeParse({ email, consent });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the form and try again");
      return;
    }
    setError(null);
    setSaving(true);

    const utm = captureUtmFromUrl() ?? getUtmContext();
    const { data: auth } = await supabase.auth.getUser();

    const { error: insertError } = await supabase.from("lead_captures").insert({
      email: parsed.data.email.toLowerCase(),
      consent: true,
      variant: context.variant.slice(0, 64),
      placement: context.placement.slice(0, 64),
      utm_source: utm?.utm_source ?? null,
      utm_medium: utm?.utm_medium ?? null,
      utm_campaign: utm?.utm_campaign ?? null,
      utm_content: utm?.utm_content ?? null,
      referrer: typeof document !== "undefined" ? document.referrer.slice(0, 512) || null : null,
      page_path:
        typeof window !== "undefined" ? window.location.pathname.slice(0, 256) : null,
      visitor_id: getVisitorId(),
      user_id: auth.user?.id ?? null,
    });

    setSaving(false);
    if (insertError) {
      // Never block the funnel on a lead-capture failure.
      toast.error("Could not save your email — continuing to sign up.");
      go();
      return;
    }
    toast.success("Thanks — we'll send your setup guide shortly.");
    go();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-emerald-400" /> Want the setup guide first?
          </DialogTitle>
          <DialogDescription>
            Optional. Leave your email and we'll send the 5-minute momentum setup guide.
            You can skip this and go straight to your free account.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="lead-email">Email</Label>
            <Input
              id="lead-email"
              type="email"
              autoComplete="email"
              maxLength={254}
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void submit();
              }}
            />
          </div>

          <div className="flex items-start gap-2">
            <Checkbox
              id="lead-consent"
              checked={consent}
              onCheckedChange={(v) => setConsent(v === true)}
              className="mt-0.5"
            />
            <Label
              htmlFor="lead-consent"
              className="text-xs font-normal leading-relaxed text-muted-foreground"
            >
              Email me product updates and educational content. No investment advice, no
              guarantees of returns — unsubscribe any time.
            </Label>
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}

          <div className="flex flex-col gap-2 sm:flex-row">
            <Button className="flex-1" onClick={() => void submit()} disabled={saving}>
              {saving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Mail className="mr-2 h-4 w-4" />
              )}
              Send guide & continue
            </Button>
            <Button variant="outline" className="flex-1" onClick={go} disabled={saving}>
              Skip <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>

          <p className="text-[11px] leading-relaxed text-muted-foreground">
            We only store your email, the landing variant and campaign tags. We never ask
            for seed phrases or private keys.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
