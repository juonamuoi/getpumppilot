import { useMemo, useState } from "react";
import { Check, Copy, Mail, Share2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  CHANNEL_PRESETS,
  buildChannelShareUrl,
  channelIntentUrl,
  getShareTarget,
  type ShareChannel,
} from "@/lib/share-links";

/** Platform buttons shown on token detail pages, in tap order. */
const CHANNELS: ShareChannel[] = ["x", "telegram", "whatsapp", "reddit", "linkedin", "email"];

const ICON: Partial<Record<ShareChannel, typeof Mail>> = { email: Mail };

/**
 * Native + platform-specific share buttons for a token detail page.
 *
 * Every generated link carries the same UTM shape
 * (`utm_source=<platform>&utm_medium=<social|messaging|email>&utm_campaign=share_asset_<symbol>`)
 * with `utm_content` identifying the surface, so attribution across channels
 * is directly comparable. The page's canonical and og:url stay clean, so
 * previews always render the token's own card.
 */
export function AssetShareButtons({ symbol }: { symbol: string }) {
  const slug = symbol.toLowerCase();
  const path = `/asset/${slug}` as const;
  const target = getShareTarget(path);
  const [copied, setCopied] = useState(false);

  const urls = useMemo(() => {
    const map = {} as Record<ShareChannel, string>;
    for (const channel of [...CHANNELS, "copy" as const]) {
      map[channel] = buildChannelShareUrl(path, channel, { content: "asset_page" });
    }
    return map;
  }, [path]);

  if (!target) return null;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(urls.copy);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
      toast.success("Tracked link copied");
    } catch {
      toast.error("Could not copy — copy the link from the address bar instead");
    }
  }

  async function nativeShare() {
    const url = buildChannelShareUrl(path, "copy", {
      source: "native_share",
      medium: "share_sheet",
      content: "asset_page",
    });
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share({ title: target!.title, text: target!.summary, url });
        return;
      } catch {
        // User dismissed the sheet, or the platform refused — fall back to copy.
      }
    }
    await copyLink();
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button size="sm" onClick={nativeShare} className="gap-1.5">
        <Share2 className="h-3.5 w-3.5" />
        Share {symbol.toUpperCase()}
      </Button>

      {CHANNELS.map((channel) => {
        const href = channelIntentUrl(channel, urls[channel], target);
        if (!href) return null;
        const Icon = ICON[channel];
        return (
          <Button key={channel} size="sm" variant="outline" asChild className="gap-1.5">
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer nofollow"
              aria-label={`Share ${symbol.toUpperCase()} on ${CHANNEL_PRESETS[channel].label}`}
            >
              {Icon ? <Icon className="h-3.5 w-3.5" /> : null}
              {CHANNEL_PRESETS[channel].label}
            </a>
          </Button>
        );
      })}

      <Button size="sm" variant="outline" onClick={copyLink} className="gap-1.5">
        {copied ? <Check className="h-3.5 w-3.5 text-primary" /> : <Copy className="h-3.5 w-3.5" />}
        {copied ? "Copied" : "Copy link"}
      </Button>
    </div>
  );
}
