import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { RefreshCw, ShieldCheck, AlertTriangle, Link2, Download } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { auditSeoUrls, type SeoRouteAudit } from "@/lib/seo-preview.functions";
import { useAuth } from "@/lib/auth-store";

export const Route = createFileRoute("/seo-preview")({
  head: () => ({
    meta: [
      { title: "Pre-publish SEO preview — PumpPilot AI" },
      {
        name: "description",
        content:
          "Internal pre-publish check listing every route's canonical and og:url so domain and host mismatches are caught before deployment.",
      },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Pre-publish SEO preview — PumpPilot AI" },
      {
        property: "og:description",
        content: "Confirm canonical and og:url host matching for every route before publishing.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SeoPreviewPage,
});

function statusOf(row: SeoRouteAudit) {
  if (row.issues.length === 0) return "ok" as const;
  const blocking = row.issues.some(
    (i) =>
      i.startsWith("HTTP") ||
      i.startsWith("Missing") ||
      i.startsWith("Host mismatch") ||
      i.startsWith("Canonical points") ||
      i === "canonical and og:url differ" ||
      i === "Fetch failed",
  );
  return blocking ? ("fail" as const) : ("warn" as const);
}

function download(name: string, body: string, type: string) {
  const url = URL.createObjectURL(new Blob([body], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function SeoPreviewPage() {
  const { user, loading } = useAuth();
  const runAudit = useServerFn(auditSeoUrls);
  const [filter, setFilter] = useState("");
  const [onlyIssues, setOnlyIssues] = useState(false);

  const query = useQuery({
    queryKey: ["seo-preview"],
    queryFn: () => runAudit({}),
    enabled: !!user,
  });

  const rows = useMemo(() => {
    const all = query.data?.routes ?? [];
    const q = filter.trim().toLowerCase();
    return all.filter((r) => {
      if (onlyIssues && statusOf(r) === "ok") return false;
      if (!q) return true;
      return (
        r.path.toLowerCase().includes(q) ||
        (r.canonical ?? "").toLowerCase().includes(q) ||
        (r.title ?? "").toLowerCase().includes(q)
      );
    });
  }, [query.data, filter, onlyIssues]);

  const counts = useMemo(() => {
    const all = query.data?.routes ?? [];
    return {
      total: all.length,
      ok: all.filter((r) => statusOf(r) === "ok").length,
      warn: all.filter((r) => statusOf(r) === "warn").length,
      fail: all.filter((r) => statusOf(r) === "fail").length,
    };
  }, [query.data]);

  const readyToPublish = counts.total > 0 && counts.fail === 0;

  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Pre-publish SEO preview</h1>
          <p className="text-sm text-muted-foreground">
            Every sitemap route's canonical and og:url, fetched from the running build so you can
            confirm domain and host matching before you deploy.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={!query.data}
            onClick={() =>
              query.data &&
              download(
                `seo-preview-${Date.now()}.json`,
                JSON.stringify(query.data, null, 2),
                "application/json",
              )
            }
          >
            <Download className="mr-2 h-4 w-4" /> Export JSON
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => query.refetch()}
            aria-label="Re-run canonical check"
          >
            <RefreshCw className={`h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </header>

      {!loading && !user && (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            Sign in to run the pre-publish check.{" "}
            <Link to="/auth" className="text-primary underline">
              Go to sign in
            </Link>
          </CardContent>
        </Card>
      )}

      {user && (
        <>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                {readyToPublish ? (
                  <ShieldCheck className="h-4 w-4 text-emerald-400" />
                ) : (
                  <AlertTriangle className="h-4 w-4 text-amber-400" />
                )}
                {query.isLoading
                  ? "Checking routes…"
                  : readyToPublish
                    ? "All canonicals match the production host"
                    : `${counts.fail} route(s) need attention`}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">{counts.total} routes</Badge>
                <Badge className="bg-emerald-500/15 text-emerald-400">{counts.ok} clean</Badge>
                <Badge className="bg-amber-500/15 text-amber-400">{counts.warn} warnings</Badge>
                <Badge className="bg-destructive/15 text-destructive">{counts.fail} failing</Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                Expected host{" "}
                <code className="text-foreground">{query.data?.expectedOrigin ?? "—"}</code> ·
                checked against{" "}
                <code className="text-foreground">{query.data?.checkedOrigin ?? "—"}</code>
                {query.data
                  ? ` · ${new Date(query.data.generatedAt).toLocaleString()}`
                  : ""}
              </p>
              <p className="text-xs text-muted-foreground">
                Tags are read from the currently running build. Changes only reach crawlers after
                you publish.
              </p>
            </CardContent>
          </Card>

          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter by path, title or canonical…"
              className="max-w-xs"
              aria-label="Filter routes"
            />
            <Button
              variant={onlyIssues ? "default" : "outline"}
              size="sm"
              onClick={() => setOnlyIssues((v) => !v)}
            >
              Only issues
            </Button>
          </div>

          <div className="space-y-3">
            {query.isLoading && (
              <Card>
                <CardContent className="p-6 text-sm text-muted-foreground">
                  Fetching each route and parsing its head tags…
                </CardContent>
              </Card>
            )}

            {!query.isLoading && rows.length === 0 && (
              <Card>
                <CardContent className="p-6 text-sm text-muted-foreground">
                  No routes match this filter.
                </CardContent>
              </Card>
            )}

            {rows.map((row) => {
              const state = statusOf(row);
              return (
                <Card key={row.path}>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex flex-wrap items-center gap-2 text-sm">
                      <Link2 className="h-4 w-4 text-muted-foreground" />
                      <span className="font-mono">{row.path}</span>
                      <Badge
                        className={
                          state === "ok"
                            ? "bg-emerald-500/15 text-emerald-400"
                            : state === "warn"
                              ? "bg-amber-500/15 text-amber-400"
                              : "bg-destructive/15 text-destructive"
                        }
                      >
                        {state === "ok" ? "Match" : state === "warn" ? "Warning" : "Mismatch"}
                      </Badge>
                      {row.status !== null && (
                        <Badge variant="outline">HTTP {row.status}</Badge>
                      )}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    {row.title && (
                      <p className="text-muted-foreground">
                        <span className="text-foreground">Title:</span> {row.title}
                      </p>
                    )}
                    <dl className="grid gap-1 text-xs sm:grid-cols-[9rem_1fr]">
                      <dt className="text-muted-foreground">canonical</dt>
                      <dd className="break-all font-mono">{row.canonical ?? "—"}</dd>
                      <dt className="text-muted-foreground">og:url</dt>
                      <dd className="break-all font-mono">{row.ogUrl ?? "—"}</dd>
                      <dt className="text-muted-foreground">og:title</dt>
                      <dd className="break-all">{row.ogTitle ?? "—"}</dd>
                      <dt className="text-muted-foreground">og:description</dt>
                      <dd className="break-all">{row.ogDescription ?? "—"}</dd>
                      <dt className="text-muted-foreground">og:image</dt>
                      <dd className="break-all font-mono">{row.ogImage ?? "—"}</dd>
                      <dt className="text-muted-foreground">twitter:card</dt>
                      <dd className="font-mono">{row.twitterCard ?? "—"}</dd>
                      <dt className="text-muted-foreground">twitter:site</dt>
                      <dd className="font-mono">{row.twitterSite ?? "—"}</dd>
                      {row.robots && (
                        <>
                          <dt className="text-muted-foreground">robots</dt>
                          <dd className="font-mono">{row.robots}</dd>
                        </>
                      )}
                    </dl>

                    {row.issues.length > 0 && (
                      <ul className="list-inside list-disc text-xs text-amber-400">
                        {row.issues.map((issue) => (
                          <li key={issue}>{issue}</li>
                        ))}
                      </ul>
                    )}
                    {row.error && (
                      <p className="text-xs text-destructive">{row.error}</p>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
