import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-store";
import { McpAuditExport } from "@/components/mcp-audit-export";
import { McpRateLimits } from "@/components/mcp-rate-limits";
import { Gauge } from "lucide-react";

import { toast } from "sonner";
import {
  Bot,
  Loader2,
  RefreshCw,
  ShieldOff,
  Plug,
  ScrollText,
  CheckCircle2,
  XCircle,
  Clock,
} from "lucide-react";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Agent access & MCP audit trail | PumpPilot AI" },
      {
        name: "description",
        content:
          "Review every MCP tool call made on your behalf, inspect consent grants per connected AI agent, and revoke any client instantly.",
      },
      { property: "og:title", content: "Settings — Agent access & MCP audit trail" },
      {
        property: "og:description",
        content:
          "Audit trail, consent grants and one-click revocation for AI agents connected to PumpPilot AI.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SettingsPage,
});

type Grant = {
  id: string;
  client_id: string;
  first_granted_at: string;
  last_seen_at: string | null;
  tools_used: string[] | null;
  call_count: number;
  revoked_at: string | null;
};

type AuditRow = {
  id: string;
  correlation_id: string;
  client_id: string | null;
  tool_name: string;
  status: string;
  duration_ms: number | null;
  request: Record<string, unknown> | null;
  error_message: string | null;
  created_at: string;
};

const STATUS_TONE: Record<string, string> = {
  ok: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  started: "border-sky-500/40 bg-sky-500/10 text-sky-300",
  error: "border-rose-500/40 bg-rose-500/10 text-rose-300",
  exception: "border-rose-500/40 bg-rose-500/10 text-rose-300",
  rate_limited: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  revoked: "border-muted-foreground/30 bg-muted/40 text-muted-foreground",
};

function StatusBadge({ status }: { status: string }) {
  const Icon =
    status === "ok" ? CheckCircle2 : status === "started" ? Clock : XCircle;
  return (
    <Badge
      variant="outline"
      className={STATUS_TONE[status] ?? "border-muted-foreground/30 text-muted-foreground"}
    >
      <Icon className="mr-1 h-3 w-3" />
      {status}
    </Badge>
  );
}

function fmtTime(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

function SignInPrompt() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Sign in to manage agent access</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm text-muted-foreground">
        <p>
          Your MCP audit trail and consent grants are private to your account. Sign in to
          view which AI agents have connected and revoke them.
        </p>
        <Button asChild>
          <Link to="/auth" search={{ next: "/settings" }}>
            Sign in
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function SettingsPage() {
  const { user, loading: authLoading } = useAuth();
  const [grants, setGrants] = useState<Grant[]>([]);
  const [logs, setLogs] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [clientFilter, setClientFilter] = useState("all");

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const [g, l] = await Promise.all([
      supabase
        .from("mcp_consent_grants")
        .select("*")
        .order("last_seen_at", { ascending: false }),
      supabase
        .from("mcp_audit_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500),
    ]);
    if (g.error) toast.error("Could not load consent grants");
    if (l.error) toast.error("Could not load audit trail");
    setGrants((g.data as Grant[] | null) ?? []);
    setLogs((l.data as AuditRow[] | null) ?? []);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  const revoke = useCallback(
    async (grant: Grant) => {
      setRevoking(grant.id);
      const { error } = await supabase
        .from("mcp_consent_grants")
        .update({ revoked_at: new Date().toISOString() })
        .eq("id", grant.id);
      setRevoking(null);
      if (error) {
        toast.error("Revoke failed — please try again");
        return;
      }
      toast.success(`${grant.client_id} revoked`, {
        description: "Further tool calls from this agent are blocked immediately.",
      });
      void load();
    },
    [load],
  );

  const restore = useCallback(
    async (grant: Grant) => {
      const { error } = await supabase
        .from("mcp_consent_grants")
        .update({ revoked_at: null })
        .eq("id", grant.id);
      if (error) {
        toast.error("Could not restore access");
        return;
      }
      toast.success(`${grant.client_id} re-enabled`);
      void load();
    },
    [load],
  );

  const clientIds = useMemo(
    () => Array.from(new Set(logs.map((l) => l.client_id ?? "unknown"))).sort(),
    [logs],
  );

  const filteredLogs = useMemo(() => {
    const q = search.trim().toLowerCase();
    return logs.filter((l) => {
      if (statusFilter !== "all" && l.status !== statusFilter) return false;
      if (clientFilter !== "all" && (l.client_id ?? "unknown") !== clientFilter) return false;
      if (!q) return true;
      return (
        l.tool_name.toLowerCase().includes(q) ||
        (l.client_id ?? "").toLowerCase().includes(q) ||
        l.correlation_id.toLowerCase().includes(q) ||
        (l.error_message ?? "").toLowerCase().includes(q)
      );
    });
  }, [logs, search, statusFilter, clientFilter]);

  const activeGrants = grants.filter((g) => !g.revoked_at).length;
  const okRate = logs.length
    ? Math.round((logs.filter((l) => l.status === "ok").length / logs.length) * 100)
    : 0;

  return (
    <AppShell>
      <div className="space-y-6">
        <header className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
          <p className="text-sm text-muted-foreground">
            Agent access control — review your MCP audit trail, inspect consent grants per
            connected agent, and revoke any client immediately.
          </p>
        </header>

        {authLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : !user ? (
          <SignInPrompt />
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <Card>
                <CardContent className="pt-6">
                  <div className="text-xs uppercase tracking-widest text-muted-foreground">
                    Connected agents
                  </div>
                  <div className="mt-1 text-2xl font-bold">{activeGrants}</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-xs uppercase tracking-widest text-muted-foreground">
                    Logged calls
                  </div>
                  <div className="mt-1 text-2xl font-bold">{logs.length}</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="text-xs uppercase tracking-widest text-muted-foreground">
                    Success rate
                  </div>
                  <div className="mt-1 text-2xl font-bold">{okRate}%</div>
                </CardContent>
              </Card>
            </div>

            <div className="flex justify-end">
              <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
                {loading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="mr-2 h-4 w-4" />
                )}
                Refresh
              </Button>
            </div>

            <Tabs defaultValue="agents">
              <TabsList>
                <TabsTrigger value="agents">
                  <Plug className="mr-2 h-4 w-4" /> Connected agents
                </TabsTrigger>
                <TabsTrigger value="audit">
                  <ScrollText className="mr-2 h-4 w-4" /> Audit trail
                </TabsTrigger>
                <TabsTrigger value="limits">
                  <Gauge className="mr-2 h-4 w-4" /> Rate limits
                </TabsTrigger>
              </TabsList>

              <TabsContent value="limits" className="mt-4">
                {user && (
                  <McpRateLimits
                    userId={user.id}
                    agentIds={grants.map((g) => g.client_id).filter(Boolean)}
                  />
                )}
              </TabsContent>


              <TabsContent value="agents" className="mt-4 space-y-3">
                {grants.length === 0 && (
                  <Card>
                    <CardContent className="pt-6 text-sm text-muted-foreground">
                      No agents have connected yet. Connect an MCP client to{" "}
                      <code className="rounded bg-muted px-1">/mcp</code> and approve the
                      consent screen — it will appear here.
                    </CardContent>
                  </Card>
                )}
                {grants.map((g) => {
                  const revoked = Boolean(g.revoked_at);
                  return (
                    <Card key={g.id} className={revoked ? "opacity-70" : undefined}>
                      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
                        <div className="min-w-0">
                          <CardTitle className="flex items-center gap-2 text-base">
                            <Bot className="h-4 w-4 text-primary" />
                            <span className="truncate">{g.client_id}</span>
                            {revoked ? (
                              <Badge variant="outline" className="border-rose-500/40 text-rose-300">
                                Revoked
                              </Badge>
                            ) : (
                              <Badge
                                variant="outline"
                                className="border-emerald-500/40 text-emerald-300"
                              >
                                Active
                              </Badge>
                            )}
                          </CardTitle>
                          <p className="mt-1 text-xs text-muted-foreground">
                            First granted {fmtTime(g.first_granted_at)} · Last seen{" "}
                            {fmtTime(g.last_seen_at)} · {g.call_count} calls
                          </p>
                        </div>
                        {revoked ? (
                          <Button size="sm" variant="outline" onClick={() => void restore(g)}>
                            Re-enable
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => void revoke(g)}
                            disabled={revoking === g.id}
                          >
                            {revoking === g.id ? (
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                              <ShieldOff className="mr-2 h-4 w-4" />
                            )}
                            Revoke
                          </Button>
                        )}
                      </CardHeader>
                      <CardContent>
                        <div className="flex flex-wrap gap-1.5">
                          {(g.tools_used ?? []).length === 0 ? (
                            <span className="text-xs text-muted-foreground">
                              No tools used yet
                            </span>
                          ) : (
                            (g.tools_used ?? []).map((t) => (
                              <Badge key={t} variant="secondary" className="font-mono text-[11px]">
                                {t}
                              </Badge>
                            ))
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </TabsContent>

              <TabsContent value="audit" className="mt-4 space-y-3">
                <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto]">
                  <Input
                    placeholder="Search tool, client, correlation ID or error…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="sm:w-[160px]">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All statuses</SelectItem>
                      {["ok", "started", "error", "exception", "rate_limited", "revoked"].map(
                        (s) => (
                          <SelectItem key={s} value={s}>
                            {s}
                          </SelectItem>
                        ),
                      )}
                    </SelectContent>
                  </Select>
                  <Select value={clientFilter} onValueChange={setClientFilter}>
                    <SelectTrigger className="sm:w-[180px]">
                      <SelectValue placeholder="Client" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All clients</SelectItem>
                      {clientIds.map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs text-muted-foreground">
                    {filteredLogs.length} of {logs.length} entries shown
                  </p>
                  <McpAuditExport
                    rows={filteredLogs}
                    totalCount={logs.length}
                    userId={user?.id}
                  />
                </div>


                {filteredLogs.length === 0 ? (
                  <Card>
                    <CardContent className="pt-6 text-sm text-muted-foreground">
                      No matching audit entries.
                    </CardContent>
                  </Card>
                ) : (
                  <div className="space-y-2">
                    {filteredLogs.map((l) => (
                      <Card key={l.id}>
                        <CardContent className="space-y-2 pt-4">
                          <div className="flex flex-wrap items-center gap-2">
                            <StatusBadge status={l.status} />
                            <span className="font-mono text-sm font-semibold">{l.tool_name}</span>
                            <span className="text-xs text-muted-foreground">
                              {l.client_id ?? "unknown"}
                            </span>
                            <span className="ml-auto text-xs text-muted-foreground">
                              {fmtTime(l.created_at)}
                              {l.duration_ms != null ? ` · ${l.duration_ms}ms` : ""}
                            </span>
                          </div>
                          <div className="text-[11px] text-muted-foreground">
                            Correlation ID:{" "}
                            <code className="font-mono">{l.correlation_id}</code>
                          </div>
                          {l.request && Object.keys(l.request).length > 0 && (
                            <pre className="overflow-x-auto rounded bg-muted/50 p-2 text-[11px]">
                              {JSON.stringify(l.request, null, 2)}
                            </pre>
                          )}
                          {l.error_message && (
                            <p className="text-xs text-rose-300">{l.error_message}</p>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  Showing the most recent 500 calls. Inputs are stored redacted — never full
                  payloads.
                </p>
              </TabsContent>
            </Tabs>
          </>
        )}
      </div>
    </AppShell>
  );
}
