import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  FileCode2,
  RefreshCw,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getSeoHealth } from "@/lib/seo-health.functions";

function fmt(iso: string | null | undefined) {
  if (!iso) return "—";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "—";
  return new Date(t).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function relative(iso: string | null | undefined) {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const days = Math.floor((Date.now() - t) / 86_400_000);
  if (days <= 0) return "today";
  return `${days}d ago`;
}

function StatusPill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <Badge
      variant="outline"
      className={
        ok
          ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-500"
          : "border-destructive/30 bg-destructive/15 text-destructive"
      }
    >
      {ok ? <CheckCircle2 className="mr-1 h-3 w-3" /> : <XCircle className="mr-1 h-3 w-3" />}
      {label}
    </Badge>
  );
}

/**
 * Live SEO health: is the deployed sitemap.xml valid, is robots.txt allowing
 * crawlers and pointing at it, and when did Google last crawl / index each
 * advertised URL.
 */
export function SeoHealthPanel() {
  const fetchHealth = useServerFn(getSeoHealth);
  const [maxInspections, setMaxInspections] = useState(10);

  const health = useQuery({
    queryKey: ["seo-health", maxInspections],
    queryFn: () => fetchHealth({ data: { maxInspections } }),
    staleTime: 5 * 60_000,
  });

  const data = health.data;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <ShieldCheck className="h-4 w-4 text-primary" /> Live SEO health
          </h2>
          <p className="text-sm text-muted-foreground">
            Current state of the deployed sitemap and robots.txt, plus the last time Google
            crawled each advertised URL.
            {data ? ` Checked ${fmt(data.generatedAt)}.` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setMaxInspections((n) => (n === 10 ? 25 : 10))}
          >
            Inspect {maxInspections === 10 ? "25" : "10"} URLs
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => health.refetch()}
            disabled={health.isFetching}
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${health.isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {health.error ? (
        <Card className="border-destructive/40">
          <CardContent className="flex items-start gap-3 p-4 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 text-destructive" />
            <span>
              {health.error instanceof Error
                ? health.error.message
                : "Could not load live SEO health."}
            </span>
          </CardContent>
        </Card>
      ) : null}

      {health.isLoading ? (
        <Card>
          <CardContent className="p-4 text-sm text-muted-foreground">
            Checking sitemap, robots.txt and indexing status…
          </CardContent>
        </Card>
      ) : null}

      {data ? (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <FileCode2 className="h-4 w-4" /> sitemap.xml
                  </CardTitle>
                  <StatusPill ok={data.sitemap.ok} label={data.sitemap.ok ? "Healthy" : "Problem"} />
                </div>
                <CardDescription className="break-all">{data.sitemap.url}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-1 text-sm">
                <p>
                  HTTP {data.sitemap.httpStatus ?? "—"} · {data.sitemap.urlCount} URLs ·{" "}
                  {data.sitemap.lastmodCount} with lastmod
                </p>
                <p className="text-xs text-muted-foreground">
                  Content type: {data.sitemap.contentType ?? "—"}
                </p>
                <p className="text-xs text-muted-foreground">
                  Newest lastmod: {fmt(data.sitemap.newestLastmod)}
                </p>
                {data.sitemap.error ? (
                  <p className="text-xs text-destructive">{data.sitemap.error}</p>
                ) : null}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <FileCode2 className="h-4 w-4" /> robots.txt
                  </CardTitle>
                  <StatusPill ok={data.robots.ok} label={data.robots.ok ? "Healthy" : "Problem"} />
                </div>
                <CardDescription className="break-all">{data.robots.url}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-1 text-sm">
                <p>
                  HTTP {data.robots.httpStatus ?? "—"} · {data.robots.userAgents.length} user-agent
                  block{data.robots.userAgents.length === 1 ? "" : "s"} · {data.robots.allowCount}{" "}
                  allow / {data.robots.disallowCount} disallow
                </p>
                <p className="text-xs text-muted-foreground">
                  Sitemap directive:{" "}
                  {data.robots.sitemapDirectives.length
                    ? data.robots.sitemapDirectives.join(", ")
                    : "missing"}
                  {data.robots.sitemapDirectives.length && !data.robots.sitemapMatchesSitemapUrl
                    ? " (does not match the live sitemap URL)"
                    : ""}
                </p>
                {data.robots.blocksEverything ? (
                  <p className="text-xs text-destructive">
                    robots.txt currently blocks all crawlers.
                  </p>
                ) : null}
                {data.robots.error && !data.robots.blocksEverything ? (
                  <p className="text-xs text-destructive">{data.robots.error}</p>
                ) : null}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Submitted sitemaps (Search Console)</CardTitle>
              <CardDescription>
                What Google has on file, when it last downloaded each sitemap, and how many of its
                URLs are indexed.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {data.searchConsoleError ? (
                <p className="text-xs text-muted-foreground">{data.searchConsoleError}</p>
              ) : data.submittedSitemaps.length === 0 ? (
                <p className="text-muted-foreground">No sitemaps submitted for this property.</p>
              ) : (
                data.submittedSitemaps.map((s) => (
                  <div key={s.path} className="rounded-lg border border-border p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="break-all font-medium">{s.path}</span>
                      <StatusPill ok={s.errors === 0} label={`${s.errors} errors`} />
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {s.warnings} warnings · {s.indexed}/{s.submitted} indexed · submitted{" "}
                      {fmt(s.lastSubmitted)} · last downloaded {fmt(s.lastDownloaded)}
                      {s.isPending ? " · pending" : ""}
                    </p>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Clock className="h-4 w-4" /> Last indexed / crawled
              </CardTitle>
              <CardDescription>
                Per-URL indexing state and the timestamp of Google&apos;s most recent crawl.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {data.indexedUrls.length === 0 ? (
                <p className="text-muted-foreground">
                  {data.searchConsoleError ?? "No URLs inspected."}
                </p>
              ) : (
                data.indexedUrls.map((u) => (
                  <div
                    key={u.url}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-3"
                  >
                    <div className="min-w-0">
                      <p className="break-all font-medium">{u.url}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {u.error ?? u.coverageState ?? u.verdict ?? "Unknown"}
                        {u.googleCanonical && u.userCanonical && u.googleCanonical !== u.userCanonical
                          ? " · canonical mismatch"
                          : ""}
                      </p>
                    </div>
                    <div className="text-right">
                      <StatusPill ok={u.indexed} label={u.indexed ? "Indexed" : "Not indexed"} />
                      <p className="mt-1 text-xs text-muted-foreground">
                        {fmt(u.lastCrawlTime)}
                        {relative(u.lastCrawlTime) ? ` (${relative(u.lastCrawlTime)})` : ""}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}
