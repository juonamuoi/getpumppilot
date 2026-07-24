import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-store";
import { getMyReferralCode, getMyReferralCount, getMyRewardMonths, getMyQualifiedReferralCount } from "@/lib/referral";
import { nativeShare } from "@/lib/native";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Copy, Share2, Twitter, Mail, MessageCircle, Gift, Users, Sparkles, Check } from "lucide-react";
import { toast } from "sonner";

const BASE = "https://crypto-spotter-pro.lovable.app";

export const Route = createFileRoute("/refer")({
  head: () => ({
    meta: [
      { title: "Invite friends & earn — PumpPilot AI" },
      { name: "description", content: "Share PumpPilot AI with friends. You both get 1 month of Pro free when they sign up and stay for 7 days." },
      { property: "og:title", content: "Invite friends & earn — PumpPilot AI" },
      { property: "og:description", content: "You both get 1 month of Pro free when they sign up." },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "canonical", href: `${BASE}/refer` }],
  }),
  component: ReferPage,
});

function ReferPage() {
  const { user, loading } = useAuth();
  const [code, setCode] = useState<string | null>(null);
  const [count, setCount] = useState<number>(0);
  const [qualified, setQualified] = useState<number>(0);
  const [rewardMonths, setRewardMonths] = useState<number>(0);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!user) return;
    getMyReferralCode(user.id).then(setCode);
    getMyReferralCount(user.id).then(setCount);
    getMyQualifiedReferralCount(user.id).then(setQualified);
    getMyRewardMonths().then(setRewardMonths);
  }, [user]);

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center text-muted-foreground">Loading…</div>;
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-24 text-center">
        <Gift className="mx-auto h-12 w-12 text-primary" />
        <h1 className="mt-4 text-3xl font-bold">Sign in to get your referral link</h1>
        <p className="mt-2 text-muted-foreground">Invite friends, earn free months of Pro.</p>
        <Button asChild className="mt-6">
          <Link to="/auth">Sign in</Link>
        </Button>
      </div>
    );
  }

  const link = code ? `${BASE}/?ref=${code}` : "";
  const shareText = "I'm using PumpPilot AI — explainable AI signals, paper trading, and real risk controls. Join with my link and we both get 1 month of Pro free:";

  const copy = async () => {
    if (!link) return;
    await navigator.clipboard.writeText(link);
    setCopied(true);
    toast.success("Link copied");
    setTimeout(() => setCopied(false), 2000);
  };

  const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}&url=${encodeURIComponent(link)}`;
  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(shareText + " " + link)}`;
  const emailUrl = `mailto:?subject=${encodeURIComponent("Try PumpPilot AI with me")}&body=${encodeURIComponent(shareText + "\n\n" + link)}`;

  const nativeShare = async () => {
    if (!navigator.share) { copy(); return; }
    try {
      await navigator.share({ title: "PumpPilot AI", text: shareText, url: link });
    } catch {}
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-4xl px-6 py-12">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Gift className="h-4 w-4 text-primary" />
          <span>Referral program</span>
        </div>
        <h1 className="mt-2 text-4xl font-bold tracking-tight">Invite friends. Earn free Pro.</h1>
        <p className="mt-3 max-w-2xl text-muted-foreground">
          Share your personal link. When a friend signs up and stays for 7 days, <span className="text-foreground font-medium">you both get 1 month of Pro free</span>.
        </p>

        <div className="mt-8 grid gap-4 md:grid-cols-4">
          <StatCard icon={<Users className="h-5 w-5" />} label="Friends referred" value={String(count)} />
          <StatCard icon={<Check className="h-5 w-5" />} label="Qualified (7-day)" value={String(qualified)} />
          <StatCard icon={<Sparkles className="h-5 w-5" />} label="Free months earned" value={String(rewardMonths)} />
          <StatCard icon={<Gift className="h-5 w-5" />} label="Your code" value={code ?? "—"} mono />
        </div>

        <Card className="mt-8">
          <CardHeader>
            <CardTitle>Your referral link</CardTitle>
            <CardDescription>Anyone who signs up with this link is attributed to you.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Input readOnly value={link} className="font-mono text-sm" />
              <Button onClick={copy} variant="outline" className="shrink-0">
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                <span className="ml-2">{copied ? "Copied" : "Copy"}</span>
              </Button>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Button asChild variant="secondary">
                <a href={twitterUrl} target="_blank" rel="noopener noreferrer">
                  <Twitter className="mr-2 h-4 w-4" /> Twitter
                </a>
              </Button>
              <Button asChild variant="secondary">
                <a href={whatsappUrl} target="_blank" rel="noopener noreferrer">
                  <MessageCircle className="mr-2 h-4 w-4" /> WhatsApp
                </a>
              </Button>
              <Button asChild variant="secondary">
                <a href={emailUrl}>
                  <Mail className="mr-2 h-4 w-4" /> Email
                </a>
              </Button>
              <Button onClick={nativeShare} variant="secondary">
                <Share2 className="mr-2 h-4 w-4" /> Share
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="mt-6">
          <CardHeader>
            <CardTitle>How it works</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="space-y-3 text-sm">
              {[
                "Share your link with anyone learning to trade smarter.",
                "They sign up and get 1 month of Pro on us.",
                "Once they stay active for 7 days, you get 1 month of Pro too.",
                "No limit — the more friends you refer, the more free Pro you stack.",
              ].map((step, i) => (
                <li key={i} className="flex gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">{i + 1}</span>
                  <span className="text-muted-foreground">{step}</span>
                </li>
              ))}
            </ol>
            <p className="mt-4 text-xs text-muted-foreground">
              Rewards are credited automatically each day once your friend's referral qualifies (signed up more than 7 days ago and still active). Self-referrals and abusive patterns are ignored.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, mono }: { icon: React.ReactNode; label: string; value: string; mono?: boolean }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 py-6">
        <div className="rounded-lg bg-primary/10 p-3 text-primary">{icon}</div>
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
          <div className={`text-2xl font-bold ${mono ? "font-mono" : ""}`}>{value}</div>
        </div>
      </CardContent>
    </Card>
  );
}
