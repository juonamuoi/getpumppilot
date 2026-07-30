import { withSocialMeta } from "@/lib/social-meta";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { HardDrive, RefreshCw, ShieldAlert, ShieldCheck, Download } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getStorageAccessAudit } from "@/lib/storage-audit.functions";
import { StorageAlertsPanel } from "@/components/storage-alerts-panel";
import { useAuth } from "@/lib/auth-store";

export const Route = createFileRoute("/storage-audit")({
  head: () => ({
    meta: withSocialMeta([
      { title: "Storage Access Audit — PumpPilot AI" },
      {
        name: "description",
        content:
          "Internal admin view of recent object-storage access attempts, showing bucket, user path and the allow or deny outcome for each request.",
      },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Storage Access Audit — PumpPilot AI" },
      {
        property: "og:description",
        content:
          "Recent storage access attempts with allow/deny outcomes per bucket and user path.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ]),
  }),
  component: StorageAuditPage,
});

const BUCKETS = ["all", "threat-reports", "database_export_28_07_26"] as const;

function short(id: string | null) {
  if (!id) return "—";
  return `${id.slice(0, 8)}…`;
}

function StorageAuditPage() {
  const { user, loading } = useAuth();
  const [hours, setHours] = useState("24");
  const [bucket, setBucket] = useState<string>("all");
  const [decision, setDecision] = useState<"all" | "allow" | "deny">("all");
  const [q, setQ] = useState("");

  const fetchAudit = useServerFn(getStorageAccessAudit);
  const query = useQuery({
    queryKey: ["storage-audit", hours, bucket, decision, q],
    queryFn: () =>
      fetchAudit({ data: { hours: Number(hours), bucket, decision, q } }),
    enabled: !!user,
  });

  const rows = query.data ?? [];

  const totals = useMemo(() => {
    const allow = rows.filter((r) => r.decision === "allow").length;
    const deny = rows.length - allow;
    const mismatches = rows.filter(
      (r) => r.path_owner_id && r.user_id && r.path_owner_id !== r.user_id,
    ).length;
    return { allow, deny, mismatches, total: rows.length };
  }, [rows]);

  function exportCsv() {
    const head = [
      "created_at",
      "bucket",
      "object_path",
      "operation",
      "decision",
      "reason",
      "user_id",
      "path_owner_id",
      "correlation_id",
    ];
    const body = rows.map((r) =>
      head
        .map((k) => `"${String((r as Record<string, unknown>)[k] ?? "").replace(/"/g, '""')}"`)
        .join(","),
    );
    const blob = new Blob([[head.join(","), ...body].join("\n")], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `storage-access-audit-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (loading) return <div className="p-8 text-sm text-muted-foreground">Loading…</div>;

  if (!user) {
    return (
      <div className="mx-auto max-w-md px-4 py-20 text-center">
        <h1 className="text-2xl font-bold">Storage access audit</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          This internal dashboard is only available to signed-in admins.
        </p>
        <Button className="mt-6" asChild>
          <Link to="/auth">Sign in</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Badge variant="outline" className="mb-2">
            Internal · admin only · not indexed
          </Badge>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <HardDrive className="h-5 w-5 text-emerald-400" /> Storage access audit
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Every read and write against a private bucket, with the object path, the
            folder owner and whether the request was allowed or denied.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={exportCsv} disabled={!rows.length}>
            <Download className="mr-2 h-4 w-4" /> CSV
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={() => query.refetch()}
            aria-label="Refresh audit"
          >
            <RefreshCw className={`h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-4">
        {[
          { label: "Attempts", value: totals.total },
          { label: "Allowed", value: totals.allow },
          { label: "Denied", value: totals.deny },
          { label: "Owner mismatches", value: totals.mismatches },
        ].map((t) => (
          <Card key={t.label}>
            <CardContent className="p-4">
              <div className="text-xs uppercase tracking-wide text-muted-foreground">
                {t.label}
              </div>
              <div className="mt-1 text-2xl font-bold">{t.value.toLocaleString()}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <StorageAlertsPanel />

      <Card className="mt-6">
        <CardHeader className="gap-3">
          <CardTitle className="text-base">Recent attempts</CardTitle>
          <div className="flex flex-wrap gap-2">
            <Select value={hours} onValueChange={setHours}>
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">Last hour</SelectItem>
                <SelectItem value="24">Last 24 hours</SelectItem>
                <SelectItem value="168">Last 7 days</SelectItem>
                <SelectItem value="720">Last 30 days</SelectItem>
              </SelectContent>
            </Select>
            <Select value={bucket} onValueChange={setBucket}>
              <SelectTrigger className="w-52">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BUCKETS.map((b) => (
                  <SelectItem key={b} value={b}>
                    {b === "all" ? "All buckets" : b}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={decision}
              onValueChange={(v) => setDecision(v as "all" | "allow" | "deny")}
            >
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All outcomes</SelectItem>
                <SelectItem value="allow">Allowed</SelectItem>
                <SelectItem value="deny">Denied</SelectItem>
              </SelectContent>
            </Select>
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search path, reason or correlation ID"
              className="w-full sm:w-72"
            />
          </div>
        </CardHeader>
        <CardContent>
          {query.isError && (
            <p className="py-8 text-center text-sm text-destructive">
              {(query.error as Error)?.message?.includes("Forbidden")
                ? "Admin role required to view the storage audit trail."
                : "Could not load the audit trail."}
            </p>
          )}
          {!query.isError && !rows.length && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {query.isLoading ? "Loading attempts…" : "No storage access attempts in this window."}
            </p>
          )}
          {!!rows.length && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 pr-4">Time</th>
                    <th className="py-2 pr-4">Bucket</th>
                    <th className="py-2 pr-4">Object path</th>
                    <th className="py-2 pr-4">Op</th>
                    <th className="py-2 pr-4">Caller</th>
                    <th className="py-2 pr-4">Path owner</th>
                    <th className="py-2 pr-4">Outcome</th>
                    <th className="py-2">Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const mismatch =
                      !!r.path_owner_id && !!r.user_id && r.path_owner_id !== r.user_id;
                    return (
                      <tr key={r.id} className="border-b border-border/50 align-top">
                        <td className="whitespace-nowrap py-2 pr-4 text-muted-foreground">
                          {new Date(r.created_at).toLocaleString()}
                        </td>
                        <td className="py-2 pr-4">{r.bucket}</td>
                        <td className="max-w-[22rem] break-all py-2 pr-4 font-mono text-xs">
                          {r.object_path}
                        </td>
                        <td className="py-2 pr-4">{r.operation}</td>
                        <td className="py-2 pr-4 font-mono text-xs" title={r.user_id ?? ""}>
                          {short(r.user_id)}
                        </td>
                        <td
                          className={`py-2 pr-4 font-mono text-xs ${mismatch ? "text-destructive" : ""}`}
                          title={r.path_owner_id ?? ""}
                        >
                          {short(r.path_owner_id)}
                        </td>
                        <td className="py-2 pr-4">
                          {r.decision === "allow" ? (
                            <Badge
                              variant="outline"
                              className="border-emerald-500/40 text-emerald-400"
                            >
                              <ShieldCheck className="mr-1 h-3 w-3" /> Allowed
                            </Badge>
                          ) : (
                            <Badge variant="destructive">
                              <ShieldAlert className="mr-1 h-3 w-3" /> Denied
                            </Badge>
                          )}
                        </td>
                        <td className="max-w-[16rem] break-words py-2 text-xs text-muted-foreground">
                          {r.reason ?? "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <p className="mt-4 text-xs text-muted-foreground">
        Records are written server-side with elevated rights and cannot be edited or
        deleted from the app. Non-admin users can only read their own rows.
      </p>
    </div>
  );
}
