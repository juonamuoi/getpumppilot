import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Activity,
  AlertTriangle,
  BellRing,
  CheckCircle2,
  Link2,
  RefreshCw,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  acknowledgeSeoAlerts,
  getSeoCrawlAlerts,
  getSeoCrawlHistory,
  runSeoCrawlCheck,
  runSeoSelfAudit,
  type SeoAlertRow,
} from "@/lib/seo-monitor.functions";
import { useAuth } from "@/lib/auth-store";
import { withSocialMeta } from "@/lib/social-meta";

export const Route = createFileRoute("/seo-monitor")({
  head: () => ({
    meta: withSocialMeta([
      { title: "Crawl & Indexing Monitor — PumpPilot AI" },
      {
        name: "description",
        content:
          "Internal admin view tracking sitemap errors, indexing coverage and Google canonical selection over time, with alerts whenever those numbers change.",
      },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Crawl & Indexing Monitor — PumpPilot AI" },
      {
        property: "og:description",
        content:
          "Sitemap error, indexing coverage and canonical selection trends with change alerts.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ]),
  }),
  component: SeoMonitorPage,
});

const SEVERITY_STYLE: Record<SeoAlertRow["severity"], string> = {
  critical: "bg-destructive/15 text-destructive border-destructive/30",
  warning: "bg-amber-500/15 text-amber-500 border-amber-500/30",
  info: "bg-muted text-muted-foreground border-border",
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function SeoMonitorPage() {
  const { user, loading } = useAuth();
  const qc = useQueryClient();
  const [days, setDays] = useState("30");
  const [onlyOpen, setOnlyOpen] = useState(true);
  const [running, setRunning] = useState(false);

  const fetchHistory = useServerFn(getSeoCrawlHistory);
  const fetchAlerts = useServerFn(getSeoCrawlAlerts);
  const ack = useServerFn(acknowledgeSeoAlerts);
  const runCheck = useServerFn(runSeoCrawlCheck);
  const runAudit = useServerFn(runSeoSelfAudit);
  const [auditing, setAuditing] = useState(false);

  const history = useQuery({
    queryKey: ["seo-crawl-history", days],
    queryFn: () => fetchHistory({ data: { days: Number(days) } }),
    enabled: !!user,
  });
  const alerts = useQuery({
    queryKey: ["seo-crawl-alerts", days, onlyOpen],
    queryFn: () => fetchAlerts({ data: { days: Number(days), onlyOpen } }),
    enabled: !!user,
  });

  const rows = history.data ?? [];
  const latest = rows[rows.length - 1];
  const chartData = useMemo(
    () =>
      rows.map((r) => ({
        t: fmtDate(r.created_at),
        "Sitemap errors": r.sitemap_errors,
        "Sitemap warnings": r.sitemap_warnings,
        "Canonical mismatches": r.canonical_mismatches,
        "Not indexed": r.crawl_errors,
        Submitted: r.submitted_urls,
        Indexed: r.indexed_urls,
      })),
    [rows],
  );

  const openAlerts = (alerts.data ?? []).filter((a) => !a.acknowledged_at);

  async function onRun() {
    setRunning(true);
    try {
      const res = await runCheck({ data: { sampleSize: 8 } });
      if (res.ok) {
        toast.success(`Check complete — ${res.alerts} change${res.alerts === 1 ? "" : "s"} detected`);
      } else {
        toast.error(res.error ?? "Check could not complete");
      }
      await qc.invalidateQueries({ queryKey: ["seo-crawl-history"] });
      await qc.invalidateQueries({ queryKey: ["seo-crawl-alerts"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Check failed");
    } finally {
      setRunning(false);
    }
  }

  async function onRunAudit() {
    setAuditing(true);
    try {
      const res = await runAudit({ data: { maxUrls: 40 } });
      if (res.ok) {
        toast.success(
          `Audit complete — ${res.urlsChecked} URLs, ${res.issues} issue${res.issues === 1 ? "" : "s"}, ${res.newFailures} new failure${res.newFailures === 1 ? "" : "s"}`,
        );
      } else {
        toast.error(res.error ?? "Audit could not complete");
      }
      await qc.invalidateQueries({ queryKey: ["seo-crawl-history"] });
      await qc.invalidateQueries({ queryKey: ["seo-crawl-alerts"] });
      await qc.invalidateQueries({ queryKey: ["seo-open-failures"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Audit failed");
    } finally {
      setAuditing(false);
    }
  }

  async function onAckAll() {
    const ids = openAlerts.map((a) => a.id);
    if (!ids.length) return;
    await ack({ data: { ids } });
    await qc.invalidateQueries({ queryKey: ["seo-crawl-alerts"] });
    toast.success(`${ids.length} alert${ids.length === 1 ? "" : "s"} marked reviewed`);
  }

  if (loading) return null;
  if (!user) {
    return (
      <div className="p-6 text-sm text-muted-foreground">
        Sign in with an admin account to view crawl monitoring.
      </div>
    );
  }

  const error = history.error ?? alerts.error;

  return (
    <div className="space-y-6 p-4 md:p-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <Activity className="h-5 w-5 text-primary" />
            Crawl &amp; indexing monitor
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Tracks sitemap errors, indexing coverage and Google&apos;s canonical selection over
            time, and a daily scheduled audit re-fetches the sitemap and re-checks canonical and og:url
            tags on every advertised URL. Each run is compared against the previous one, and new
            failures raise an alert and an in-app notification.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={days} onValueChange={setDays}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="90">Last 90 days</SelectItem>
              <SelectItem value="365">Last year</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={onRunAudit} disabled={auditing}>
            <RefreshCw className={`mr-2 h-4 w-4 ${auditing ? "animate-spin" : ""}`} />
            Run sitemap + canonical audit
          </Button>
          <Button onClick={onRun} disabled={running}>
            <RefreshCw className={`mr-2 h-4 w-4 ${running ? "animate-spin" : ""}`} />
            Run check now
          </Button>
        </div>
      </header>

      {error ? (
        <Card className="border-destructive/40">
          <CardContent className="flex items-start gap-3 p-4 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 text-destructive" />
            <span>{error instanceof Error ? error.message : "Could not load monitoring data."}</span>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Sitemap errors", value: latest?.sitemap_errors ?? 0, bad: true },
          { label: "Sitemap warnings", value: latest?.sitemap_warnings ?? 0, bad: true },
          { label: "Canonical mismatches", value: latest?.canonical_mismatches ?? 0, bad: true },
          { label: "Open alerts", value: openAlerts.length, bad: true },
        ].map((s) => (
          <Card key={s.label}>
            <CardHeader className="pb-2">
              <CardDescription>{s.label}</CardDescription>
              <CardTitle
                className={`text-3xl ${s.value > 0 && s.bad ? "text-destructive" : "text-foreground"}`}
              >
                {s.value}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0 text-xs text-muted-foreground">
              {latest ? `Last check ${fmtDate(latest.created_at)}` : "No checks recorded yet"}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Errors over time</CardTitle>
            <CardDescription>Sitemap and canonical problems per check</CardDescription>
          </CardHeader>
          <CardContent className="h-64">
            {chartData.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="t" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="Sitemap errors" stroke="hsl(var(--destructive))" dot={false} />
                  <Line type="monotone" dataKey="Sitemap warnings" stroke="hsl(var(--primary))" dot={false} />
                  <Line type="monotone" dataKey="Canonical mismatches" stroke="hsl(var(--chart-3, var(--primary)))" dot={false} />
                  <Line type="monotone" dataKey="Not indexed" stroke="hsl(var(--muted-foreground))" dot={false} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-muted-foreground">
                No history yet — run a check to record the first snapshot.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Indexing coverage</CardTitle>
            <CardDescription>Submitted vs indexed URLs reported by Search Console</CardDescription>
          </CardHeader>
          <CardContent className="h-64">
            {chartData.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="t" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend />
                  <Area type="monotone" dataKey="Submitted" stroke="hsl(var(--muted-foreground))" fill="hsl(var(--muted))" />
                  <Area type="monotone" dataKey="Indexed" stroke="hsl(var(--primary))" fill="hsl(var(--primary) / 0.2)" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-muted-foreground">No coverage data yet.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4 space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <BellRing className="h-4 w-4" /> Change alerts
            </CardTitle>
            <CardDescription>
              Raised whenever a tracked number moves between two checks.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setOnlyOpen((v) => !v)}>
              {onlyOpen ? "Show all" : "Only new"}
            </Button>
            <Button variant="secondary" size="sm" onClick={onAckAll} disabled={!openAlerts.length}>
              <CheckCircle2 className="mr-2 h-4 w-4" /> Mark reviewed
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {(alerts.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No changes recorded in this window — crawl health is stable.
            </p>
          ) : (
            (alerts.data ?? []).map((a) => (
              <div
                key={a.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card/50 p-3"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className={SEVERITY_STYLE[a.severity]}>
                      {a.severity}
                    </Badge>
                    <span className="font-mono text-xs text-muted-foreground">{a.metric}</span>
                    {a.acknowledged_at ? (
                      <Badge variant="outline" className="text-xs">
                        reviewed
                      </Badge>
                    ) : null}
                  </div>
                  <p className="mt-1 break-words text-sm">{a.message}</p>
                </div>
                <span className="text-xs text-muted-foreground">{fmtDate(a.created_at)}</span>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {latest?.details?.canonicalIssues?.length ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Link2 className="h-4 w-4" /> Canonical selection issues (latest check)
            </CardTitle>
            <CardDescription>
              URLs where Google picked a different canonical or has not indexed the page.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {latest.details.canonicalIssues.map((i) => (
              <div key={i.url} className="rounded-lg border border-border p-3">
                <p className="break-all font-medium">{i.url}</p>
                <p className="mt-1 break-all text-xs text-muted-foreground">
                  declared: {i.declaredCanonical ?? "—"} · google: {i.googleCanonical ?? "—"} ·{" "}
                  {i.coverageState ?? i.verdict ?? i.issue}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
