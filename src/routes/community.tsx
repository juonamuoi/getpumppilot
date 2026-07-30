import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { DisclaimerBanner } from "@/components/disclaimer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { toast } from "sonner";
import {
  Heart,
  GitFork,
  Users,
  Trophy,
  Search,
  LogIn,
  LogOut,
  Sparkles,
  Loader2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-store";
import { cn } from "@/lib/utils";
import { withSocialMeta } from "@/lib/social-meta";

export const Route = createFileRoute("/community")({
  head: () => ({
    links: [{ rel: "canonical", href: "https://www.getpumppilot.app/community" }],
    meta: withSocialMeta([
      { property: "og:url", content: "https://www.getpumppilot.app/community" },
      { title: "Community Strategies — PumpPilot AI" },
      {
        name: "description",
        content:
          "Browse, like and fork community-published paper trading strategies. See the leaderboard of top authors.",
      },
      { property: "og:title", content: "Community Strategies — PumpPilot AI" },
      {
        property: "og:description",
        content: "Publish strategies, follow top authors, climb the PumpPilot leaderboard.",
      },
    ]),
  }),
  component: CommunityPage,
});

type StrategyRow = {
  id: string;
  author_id: string;
  title: string;
  description: string;
  config: Record<string, unknown>;
  tags: string[];
  likes_count: number;
  forks_count: number;
  parent_id: string | null;
  created_at: string;
  profiles: { display_name: string; avatar_url: string | null } | null;
};

function CommunityPage() {
  const { user, signOut } = useAuth();
  const qc = useQueryClient();
  const nav = useNavigate();
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<"top" | "new">("top");

  const strategiesQ = useQuery({
    queryKey: ["strategies", sort],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("strategies")
        .select("*, profiles:author_id(display_name, avatar_url)")
        .eq("is_public", true)
        .order(sort === "top" ? "likes_count" : "created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as unknown as StrategyRow[];
    },
  });

  const likesQ = useQuery({
    queryKey: ["my-likes", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("strategy_likes")
        .select("strategy_id")
        .eq("user_id", user!.id);
      if (error) throw error;
      return new Set((data ?? []).map((r) => r.strategy_id));
    },
  });

  const followsQ = useQuery({
    queryKey: ["my-follows", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("strategy_follows")
        .select("author_id")
        .eq("follower_id", user!.id);
      if (error) throw error;
      return new Set((data ?? []).map((r) => r.author_id));
    },
  });

  const leaderboardQ = useQuery({
    queryKey: ["leaderboard"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("strategies")
        .select("author_id, likes_count, forks_count, profiles:author_id(display_name, avatar_url)")
        .eq("is_public", true)
        .limit(500);
      if (error) throw error;
      const agg = new Map<
        string,
        { author_id: string; name: string; likes: number; forks: number; strategies: number }
      >();
      for (const r of (data ?? []) as unknown as Array<{
        author_id: string;
        likes_count: number;
        forks_count: number;
        profiles: { display_name: string } | null;
      }>) {
        const cur = agg.get(r.author_id) ?? {
          author_id: r.author_id,
          name: r.profiles?.display_name ?? "Anonymous",
          likes: 0,
          forks: 0,
          strategies: 0,
        };
        cur.likes += r.likes_count;
        cur.forks += r.forks_count;
        cur.strategies += 1;
        agg.set(r.author_id, cur);
      }
      return [...agg.values()]
        .sort((a, b) => b.likes - a.likes || b.strategies - a.strategies)
        .slice(0, 20);
    },
  });

  const filtered = useMemo(() => {
    const list = strategiesQ.data ?? [];
    if (!q.trim()) return list;
    const needle = q.toLowerCase();
    return list.filter(
      (s) =>
        s.title.toLowerCase().includes(needle) ||
        s.description.toLowerCase().includes(needle) ||
        s.tags.some((t) => t.toLowerCase().includes(needle)) ||
        (s.profiles?.display_name ?? "").toLowerCase().includes(needle),
    );
  }, [strategiesQ.data, q]);

  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel("strategies-live")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "strategies" },
        () => qc.invalidateQueries({ queryKey: ["strategies"] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [user, qc]);

  async function toggleLike(s: StrategyRow) {
    if (!user) {
      toast.info("Sign in to like");
      return nav({ to: "/auth" });
    }
    const liked = likesQ.data?.has(s.id);
    if (liked) {
      const { error } = await supabase
        .from("strategy_likes")
        .delete()
        .eq("strategy_id", s.id)
        .eq("user_id", user.id);
      if (error) return toast.error(error.message);
    } else {
      const { error } = await supabase
        .from("strategy_likes")
        .insert({ strategy_id: s.id, user_id: user.id });
      if (error) return toast.error(error.message);
    }
    qc.invalidateQueries({ queryKey: ["my-likes"] });
    qc.invalidateQueries({ queryKey: ["strategies"] });
    qc.invalidateQueries({ queryKey: ["leaderboard"] });
  }

  async function toggleFollow(authorId: string) {
    if (!user) {
      toast.info("Sign in to follow");
      return nav({ to: "/auth" });
    }
    if (authorId === user.id) return toast.info("You can't follow yourself");
    const following = followsQ.data?.has(authorId);
    if (following) {
      await supabase
        .from("strategy_follows")
        .delete()
        .eq("follower_id", user.id)
        .eq("author_id", authorId);
    } else {
      await supabase
        .from("strategy_follows")
        .insert({ follower_id: user.id, author_id: authorId });
    }
    qc.invalidateQueries({ queryKey: ["my-follows"] });
  }

  async function fork(s: StrategyRow) {
    if (!user) {
      toast.info("Sign in to fork");
      return nav({ to: "/auth" });
    }
    const { error } = await supabase.from("strategies").insert({
      author_id: user.id,
      title: `${s.title} (fork)`,
      description: s.description,
      config: s.config as never,
      tags: s.tags,
      parent_id: s.id,
    });
    if (error) return toast.error(error.message);
    await supabase
      .from("strategies")
      .update({ forks_count: s.forks_count + 1 })
      .eq("id", s.id);
    toast.success("Forked to your strategies");
    qc.invalidateQueries({ queryKey: ["strategies"] });
  }

  return (
    <AppShell>
      <div className="space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold sm:text-3xl">Community</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Explore, like, follow and fork paper strategies from other traders.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {user ? (
              <>
                <Link to="/strategy">
                  <Button size="sm">
                    <Sparkles className="mr-2 h-4 w-4" /> Publish
                  </Button>
                </Link>
                <Button size="sm" variant="outline" onClick={() => signOut()}>
                  <LogOut className="mr-2 h-4 w-4" /> Sign out
                </Button>
              </>
            ) : (
              <Link to="/auth">
                <Button size="sm">
                  <LogIn className="mr-2 h-4 w-4" /> Sign in
                </Button>
              </Link>
            )}
          </div>
        </div>
        <DisclaimerBanner />

        <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
          <Card className="border-border/60 bg-card/60">
            <CardHeader className="pb-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle className="text-base">Public strategies</CardTitle>
                <Tabs value={sort} onValueChange={(v) => setSort(v as "top" | "new")}>
                  <TabsList className="h-8">
                    <TabsTrigger value="top" className="h-7 text-xs">
                      Top
                    </TabsTrigger>
                    <TabsTrigger value="new" className="h-7 text-xs">
                      New
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
              <div className="relative pt-2">
                <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search title, tag, author…"
                  className="pl-8"
                />
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {strategiesQ.isLoading ? (
                <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Loading strategies…
                </div>
              ) : filtered.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border/60 p-8 text-center text-sm text-muted-foreground">
                  No strategies yet. Be the first to{" "}
                  <Link to="/strategy" className="text-emerald-300 hover:underline">
                    publish one
                  </Link>
                  .
                </div>
              ) : (
                filtered.map((s) => (
                  <StrategyCard
                    key={s.id}
                    s={s}
                    liked={likesQ.data?.has(s.id) ?? false}
                    following={followsQ.data?.has(s.author_id) ?? false}
                    isMe={user?.id === s.author_id}
                    onLike={() => toggleLike(s)}
                    onFollow={() => toggleFollow(s.author_id)}
                    onFork={() => fork(s)}
                  />
                ))
              )}
            </CardContent>
          </Card>

          <Card className="border-border/60 bg-card/60">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Trophy className="h-4 w-4 text-amber-300" /> Leaderboard
              </CardTitle>
              <p className="text-xs text-muted-foreground">Ranked by total likes across public strategies.</p>
            </CardHeader>
            <CardContent className="space-y-2">
              {(leaderboardQ.data ?? []).length === 0 ? (
                <div className="py-6 text-center text-xs text-muted-foreground">
                  No ranked authors yet.
                </div>
              ) : (
                (leaderboardQ.data ?? []).map((row, i) => (
                  <div
                    key={row.author_id}
                    className={cn(
                      "flex items-center gap-3 rounded-lg border border-border/60 bg-muted/20 p-2.5",
                      i === 0 && "border-amber-500/30 bg-amber-500/5",
                    )}
                  >
                    <div
                      className={cn(
                        "grid h-7 w-7 place-items-center rounded-full text-xs font-bold",
                        i === 0
                          ? "bg-amber-400 text-black"
                          : i === 1
                            ? "bg-slate-300 text-black"
                            : i === 2
                              ? "bg-amber-700 text-black"
                              : "bg-muted text-foreground",
                      )}
                    >
                      {i + 1}
                    </div>
                    <Avatar className="h-7 w-7">
                      <AvatarFallback className="text-[10px]">
                        {row.name.slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{row.name}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {row.strategies} strategy{row.strategies !== 1 ? "ies" : ""}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 text-xs text-emerald-300">
                      <Heart className="h-3 w-3" /> {row.likes}
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}

function StrategyCard({
  s,
  liked,
  following,
  isMe,
  onLike,
  onFollow,
  onFork,
}: {
  s: StrategyRow;
  liked: boolean;
  following: boolean;
  isMe: boolean;
  onLike: () => void;
  onFollow: () => void;
  onFork: () => void;
}) {
  const cfg = s.config as {
    min_momentum?: number;
    min_volume?: number;
    max_volatility?: number;
    include_demo?: boolean;
  };
  const author = s.profiles?.display_name ?? "Anonymous";
  return (
    <div className="rounded-xl border border-border/60 bg-muted/20 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Avatar className="h-6 w-6">
              <AvatarFallback className="text-[10px]">
                {author.slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="truncate text-xs text-muted-foreground">
              {author} · {new Date(s.created_at).toLocaleDateString()}
              {s.parent_id && <span className="ml-2 text-[10px] text-muted-foreground/70">(forked)</span>}
            </div>
          </div>
          <h3 className="mt-1.5 truncate text-base font-semibold">{s.title}</h3>
          {s.description && (
            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{s.description}</p>
          )}
        </div>
        {!isMe && (
          <Button
            size="sm"
            variant={following ? "secondary" : "outline"}
            onClick={onFollow}
            className="shrink-0"
          >
            <Users className="mr-1.5 h-3.5 w-3.5" />
            {following ? "Following" : "Follow"}
          </Button>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {s.tags.map((t) => (
          <Badge key={t} variant="secondary" className="text-[10px]">
            {t}
          </Badge>
        ))}
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 rounded-lg border border-border/40 bg-background/40 p-2 text-center text-[11px]">
        <Metric label="Min momentum" value={cfg.min_momentum ?? "—"} />
        <Metric label="Min volume" value={cfg.min_volume ?? "—"} />
        <Metric label="Max volatility" value={cfg.max_volatility ?? "—"} />
      </div>

      <div className="mt-3 flex items-center gap-2">
        <Button size="sm" variant={liked ? "default" : "outline"} onClick={onLike}>
          <Heart className={cn("mr-1.5 h-3.5 w-3.5", liked && "fill-current")} /> {s.likes_count}
        </Button>
        <Button size="sm" variant="outline" onClick={onFork}>
          <GitFork className="mr-1.5 h-3.5 w-3.5" /> Fork · {s.forks_count}
        </Button>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="font-mono text-sm text-emerald-300">{String(value)}</div>
    </div>
  );
}
