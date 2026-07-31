import { useMemo, useState } from "react";
import { Check, Copy, ExternalLink, Link2, ShieldCheck, Share2 } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  CHANNEL_PRESETS,
  SHARE_TARGETS,
  buildChannelShareUrl,
  channelIntentUrl,
  checkSharePreview,
  normalizeUtmValue,
  type ShareChannel,
  type ShareablePath,
} from "@/lib/share-links";
import { SOCIAL_IMAGE_URL } from "@/lib/structured-data";

const CHANNELS: ShareChannel[] = [
  "copy",
  "x",
  "linkedin",
  "facebook",
  "reddit",
  "whatsapp",
  "telegram",
  "email",
];

/**
 * Share card that appends UTM parameters for attribution while leaving the
 * page's canonical and og:url untouched, so the link preview always renders
 * this page's own OpenGraph/Twitter card.
 */
export function ShareLinks({
  path,
  image = SOCIAL_IMAGE_URL,
  className,
}: {
  path: ShareablePath;
  image?: string;
  className?: string;
}) {
  const target = getShareTarget(path);
  const [channel, setChannel] = useState<ShareChannel>("copy");
  const [campaign, setCampaign] = useState(target?.campaign ?? "");
  const [content, setContent] = useState("");
  const [copied, setCopied] = useState(false);

  const shareUrl = useMemo(
    () =>
      buildChannelShareUrl(path, channel, {
        campaign: normalizeUtmValue(campaign, target?.campaign ?? ""),
        content: content || undefined,
      }),
    [path, channel, campaign, content, target?.campaign],
  );

  const check = useMemo(() => checkSharePreview(path, shareUrl), [path, shareUrl]);
  const intent = target ? channelIntentUrl(channel, shareUrl, target) : null;


  async function copy() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
      toast.success("Tracked link copied — canonical preserved");
    } catch {
      toast.error("Could not copy — select the link and copy manually");
    }
  }

  async function share() {
    if (!intent) {
      await copy();
      return;
    }
    window.open(intent, "_blank", "noopener,noreferrer");
  }

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Share2 className="h-4 w-4 text-primary" />
          Share this page
        </CardTitle>
        <CardDescription>
          Adds UTM tracking for attribution. The page keeps a clean self-referencing canonical and
          og:url, so previews stay correct and the tracked URL is never indexed separately.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-1.5">
          {CHANNELS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setChannel(c)}
              aria-pressed={channel === c}
              className={`rounded-full border px-3 py-1 text-xs transition ${
                channel === c
                  ? "border-primary/50 bg-primary/15 text-primary"
                  : "border-border/60 bg-muted/20 text-muted-foreground hover:bg-muted/40"
              }`}
            >
              {CHANNEL_PRESETS[c].label}
            </button>
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor={`share-campaign-${path}`} className="text-xs">
              utm_campaign
            </Label>
            <Input
              id={`share-campaign-${path}`}
              value={campaign}
              onChange={(e) => setCampaign(e.target.value)}
              placeholder={target.campaign}
              className="h-8 font-mono text-xs"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`share-content-${path}`} className="text-xs">
              utm_content <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id={`share-content-${path}`}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="e.g. newsletter_footer"
              className="h-8 font-mono text-xs"
            />
          </div>
        </div>

        <div className="space-y-2 rounded-lg border border-border/60 bg-muted/15 p-3">
          <div className="flex items-start gap-2">
            <Link2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <code className="break-all text-[11px] leading-relaxed text-foreground/90">
              {shareUrl}
            </code>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={share}>
              {intent ? (
                <>
                  <ExternalLink className="mr-2 h-3.5 w-3.5" />
                  Share on {CHANNEL_PRESETS[channel].label}
                </>
              ) : copied ? (
                <>
                  <Check className="mr-2 h-3.5 w-3.5" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="mr-2 h-3.5 w-3.5" />
                  Copy link
                </>
              )}
            </Button>
            {intent ? (
              <Button size="sm" variant="outline" onClick={copy}>
                {copied ? (
                  <Check className="mr-2 h-3.5 w-3.5" />
                ) : (
                  <Copy className="mr-2 h-3.5 w-3.5" />
                )}
                Copy link
              </Button>
            ) : null}
          </div>
        </div>

        {/* Preview of exactly what crawlers will render for the shared URL */}
        <div className="overflow-hidden rounded-lg border border-border/60">
          <img
            src={image}
            alt={`Link preview image for ${target.label}`}
            width={1200}
            height={630}
            loading="lazy"
            className="aspect-[1200/630] w-full object-cover"
          />
          <div className="space-y-1 border-t border-border/60 bg-muted/10 p-3">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
              getpumppilot.app
            </p>
            <p className="text-sm font-medium leading-snug">{target.title}</p>
            <p className="text-xs leading-snug text-muted-foreground">{target.summary}</p>
          </div>
        </div>

        <div className="space-y-1.5 rounded-lg border border-emerald-500/25 bg-emerald-500/5 p-3 text-xs">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
            <span className="font-medium text-emerald-300">
              {check.ok ? "SEO-safe share link" : "Check failed"}
            </span>
            {check.tracked ? (
              <Badge variant="outline" className="border-border/60 text-[10px]">
                tracked
              </Badge>
            ) : null}
          </div>
          <ul className="space-y-0.5 pl-5 text-muted-foreground">
            {check.notes.map((n) => (
              <li key={n} className="list-disc">
                {n}
              </li>
            ))}
          </ul>
          <p className="pl-5 font-mono text-[10px] text-muted-foreground">
            canonical / og:url → {check.canonical}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
