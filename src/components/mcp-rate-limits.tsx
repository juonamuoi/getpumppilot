import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Gauge, Loader2, RotateCcw, Save, History } from "lucide-react";

type Effective = {
  plan: string;
  account_limit: number;
  client_limit: number;
  window_seconds: number;
  customized: boolean;
  defaults: {
    plan: string;
    account_limit: number;
    client_limit: number;
    window_seconds: number;
    max_account_limit: number;
    max_client_limit: number;
  };
};

type AgentOverride = { client_id: string; call_limit: number; updated_at: string };

type AuditRow = {
  id: string;
  scope: string;
  client_id: string | null;
  field: string;
  old_value: number | null;
  new_value: number | null;
  reason: string | null;
  plan: string | null;
  created_at: string;
};

const FIELD_LABEL: Record<string, string> = {
  account_limit: "Account limit (all agents)",
  client_limit: "Default per-agent limit",
  window_seconds: "Rolling window (seconds)",
  call_limit: "Agent limit",
};

export function McpRateLimits({ userId, agentIds }: { userId: string; agentIds: string[] }) {
  const [eff, setEff] = useState<Effective | null>(null);
  const [overrides, setOverrides] = useState<AgentOverride[]>([]);
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [accountLimit, setAccountLimit] = useState("");
  const [clientLimit, setClientLimit] = useState("");
  const [windowSeconds, setWindowSeconds] = useState("");
  const [reason, setReason] = useState("");
  const [agentDrafts, setAgentDrafts] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    const [e, o, a] = await Promise.all([
      supabase.rpc("mcp_effective_limits", { _user_id: userId, _client_id: null }),
      supabase
        .from("mcp_agent_rate_limits")
        .select("client_id, call_limit, updated_at")
        .order("client_id"),
      supabase
        .from("mcp_rate_limit_audit")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50),
    ]);

    if (e.error) toast.error("Could not load rate limits");
    const data = (e.data ?? null) as Effective | null;
    setEff(data);
    if (data) {
      setAccountLimit(String(data.account_limit));
      setClientLimit(String(data.client_limit));
      setWindowSeconds(String(data.window_seconds));
    }
    const ov = (o.data ?? []) as AgentOverride[];
    setOverrides(ov);
    setAgentDrafts(Object.fromEntries(ov.map((x) => [x.client_id, String(x.call_limit)])));
    setAudit((a.data ?? []) as AuditRow[]);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const overrideMap = useMemo(
    () => new Map(overrides.map((o) => [o.client_id, o.call_limit])),
    [overrides],
  );

  const allAgents = useMemo(() => {
    const set = new Set<string>([...agentIds, ...overrides.map((o) => o.client_id)]);
    return Array.from(set).filter(Boolean).sort();
  }, [agentIds, overrides]);

  const saveTenant = async () => {
    if (!eff) return;
    setSaving(true);
    const { data, error } = await supabase.rpc("mcp_set_rate_limits", {
      _account_limit: Number(accountLimit) || null,
      _client_limit: Number(clientLimit) || null,
      _window_seconds: Number(windowSeconds) || null,
      _reason: reason.trim() || null,
    });
    setSaving(false);
    if (error || !(data as { ok?: boolean } | null)?.ok) {
      toast.error(error?.message ?? "Could not save limits");
      return;
    }
    toast.success("Rate limits saved", { description: "Change recorded in the limit audit log." });
    setReason("");
    void load();
  };

  const resetToPlanDefaults = async () => {
    if (!eff) return;
    setAccountLimit(String(eff.defaults.account_limit));
    setClientLimit(String(eff.defaults.client_limit));
    setWindowSeconds(String(eff.defaults.window_seconds));
    setSaving(true);
    const { error } = await supabase.rpc("mcp_set_rate_limits", {
      _account_limit: eff.defaults.account_limit,
      _client_limit: eff.defaults.client_limit,
      _window_seconds: eff.defaults.window_seconds,
      _reason: "Reset to plan defaults",
    });
    setSaving(false);
    if (error) toast.error(error.message);
    else toast.success(`Reset to ${eff.defaults.plan} plan defaults`);
    void load();
  };

  const saveAgent = async (clientId: string, clear = false) => {
    const raw = agentDrafts[clientId];
    const value = clear ? null : Number(raw);
    if (!clear && (!Number.isFinite(value as number) || (value as number) < 1)) {
      toast.error("Enter a limit of at least 1 call per window");
      return;
    }
    setSaving(true);
    const { error } = await supabase.rpc("mcp_set_agent_rate_limit", {
      _client_id: clientId,
      _call_limit: clear ? null : (value as number),
      _reason: reason.trim() || null,
    });
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(clear ? `Override removed for ${clientId}` : `Limit updated for ${clientId}`);
    void load();
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading rate limit settings…
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Gauge className="h-4 w-4 text-primary" /> Plan &amp; tenant limits
            <Badge variant="outline" className="ml-1 uppercase">
              {eff?.plan ?? "free"} plan
            </Badge>
            {eff?.customized ? (
              <Badge variant="secondary">Customized</Badge>
            ) : (
              <Badge variant="secondary">Plan defaults</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            These caps apply to every MCP tool call made on your behalf. Defaults for the{" "}
            <strong>{eff?.defaults.plan}</strong> plan are{" "}
            {eff?.defaults.account_limit} account calls and {eff?.defaults.client_limit} per agent
            per {eff?.defaults.window_seconds}s. You can go up to{" "}
            {eff?.defaults.max_account_limit} account calls on this plan.
          </p>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="acct-limit">Account limit / window</Label>
              <Input
                id="acct-limit"
                inputMode="numeric"
                value={accountLimit}
                onChange={(e) => setAccountLimit(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cli-limit">Default per-agent limit</Label>
              <Input
                id="cli-limit"
                inputMode="numeric"
                value={clientLimit}
                onChange={(e) => setClientLimit(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="win-secs">Window (seconds)</Label>
              <Input
                id="win-secs"
                inputMode="numeric"
                value={windowSeconds}
                onChange={(e) => setWindowSeconds(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="limit-reason">Reason for change (optional, stored in audit log)</Label>
            <Input
              id="limit-reason"
              placeholder="e.g. raising limits for a bulk backfill agent"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={300}
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={saveTenant} disabled={saving}>
              {saving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              Save limits
            </Button>
            <Button variant="outline" onClick={resetToPlanDefaults} disabled={saving}>
              <RotateCcw className="mr-2 h-4 w-4" /> Reset to plan defaults
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Values are clamped to your plan ceiling, and a per-agent limit can never exceed the
            account limit.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Per-agent overrides</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {allAgents.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No agents connected yet. Once an MCP client connects, you can throttle it
              individually here.
            </p>
          )}
          {allAgents.map((id) => {
            const has = overrideMap.has(id);
            return (
              <div
                key={id}
                className="flex flex-wrap items-end gap-3 rounded-lg border border-border/60 p-3"
              >
                <div className="min-w-[180px] flex-1">
                  <div className="font-medium">{id}</div>
                  <div className="text-xs text-muted-foreground">
                    {has
                      ? `Override: ${overrideMap.get(id)} calls / ${eff?.window_seconds}s`
                      : `Using default ${eff?.client_limit} calls / ${eff?.window_seconds}s`}
                  </div>
                </div>
                <Input
                  className="w-28"
                  inputMode="numeric"
                  placeholder={String(eff?.client_limit ?? "")}
                  value={agentDrafts[id] ?? ""}
                  onChange={(e) =>
                    setAgentDrafts((d) => ({ ...d, [id]: e.target.value }))
                  }
                />
                <Button size="sm" onClick={() => saveAgent(id)} disabled={saving}>
                  Save
                </Button>
                {has && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => saveAgent(id, true)}
                    disabled={saving}
                  >
                    Clear
                  </Button>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <History className="h-4 w-4 text-primary" /> Limit change audit log
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {audit.length === 0 && (
            <p className="text-sm text-muted-foreground">No limit changes recorded yet.</p>
          )}
          {audit.map((row) => (
            <div
              key={row.id}
              className="flex flex-wrap items-center gap-2 rounded-lg border border-border/60 p-3 text-sm"
            >
              <Badge variant={row.scope === "agent" ? "secondary" : "outline"}>
                {row.scope === "agent" ? row.client_id ?? "agent" : "tenant"}
              </Badge>
              <span className="font-medium">{FIELD_LABEL[row.field] ?? row.field}</span>
              <span className="text-muted-foreground">
                {row.old_value ?? "default"} → {row.new_value ?? "default"}
              </span>
              {row.plan && (
                <Badge variant="outline" className="uppercase">
                  {row.plan}
                </Badge>
              )}
              <span className="ml-auto text-xs text-muted-foreground">
                {new Date(row.created_at).toLocaleString()}
              </span>
              {row.reason && (
                <div className="w-full text-xs text-muted-foreground">“{row.reason}”</div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
