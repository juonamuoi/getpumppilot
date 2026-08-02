import { withSocialMeta } from "@/lib/social-meta";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import ReactMarkdown from "react-markdown";
import { AlertTriangle, Bot, History, Loader2, Save, ShieldCheck, SlidersHorizontal } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth-store";
import {
  askControlPanelAdvisor,
  listConfigAudit,
  listFeatureFlags,
  updateFeatureFlag,
  type FeatureFlag,
} from "@/lib/control-panel.functions";

export const Route = createFileRoute("/control-panel")({
  head: () => ({
    meta: withSocialMeta([
      { title: "AI Control Panel — PumpPilot AI" },
      {
        name: "description",
        content:
          "Admin-only control panel for PumpPilot AI: toggle app modules, tune configuration values, review the append-only change history and get AI advice before you change anything.",
      },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "AI Control Panel — PumpPilot AI" },
      { property: "og:description", content: "Admin-only module switches, tuning values and AI change advice." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: "AI Control Panel — PumpPilot AI" },
      { name: "twitter:description", content: "Admin-only module switches, tuning values and AI change advice." },
    ]),
  }),
  component: ControlPanelPage,
});

const CATEGORY_LABELS: Record<string, string> = {
  trading: "Trading & execution",
  signals: "Signals & alerts",
  ai: "AI & agents",
  security: "Wallet security",
  growth: "Growth & marketing",
  experience: "Onboarding & experience",
  general: "General",
};

function fmt(ts: string) {
  return new Date(ts).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function FlagRow({ flag, onSave, saving }: {
  flag: FeatureFlag;
  saving: boolean;
  onSave: (patch: { value?: string; enabled?: boolean; reason?: string }) => void;
}) {
  const [value, setValue] = useState(flag.value);
  const [reason, setReason] = useState("");
  const dirty = value !== flag.value;
  const risky = flag.category === "trading" || flag.category === "security";

  return (
    <div className="rounded-lg border border-border/60 bg-card/40 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-medium">{flag.label}</p>
            <code className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">{flag.key}</code>
            {risky && (
              <Badge variant="outline" className="gap-1 border-amber-500/40 text-amber-500">
                <AlertTriangle className="h-3 w-3" aria-hidden /> High impact
              </Badge>
            )}
          </div>
          <p className="mt-1 max-w-prose text-sm text-muted-foreground">{flag.description}</p>
          <p className="mt-1 text-xs text-muted-foreground">Last changed {fmt(flag.updated_at)}</p>
        </div>

        {flag.value_type === "bool" ? (
          <div className="flex items-center gap-2">
            <Label htmlFor={`sw-${flag.key}`} className="text-sm text-muted-foreground">
              {flag.value === "true" ? "On" : "Off"}
            </Label>
            <Switch
              id={`sw-${flag.key}`}
              checked={flag.value === "true"}
              disabled={saving}
              onCheckedChange={(next) => onSave({ value: next ? "true" : "false", reason: reason || undefined })}
              aria-label={`${flag.label} — currently ${flag.value === "true" ? "on" : "off"}`}
            />
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <Input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="h-9 w-32"
              inputMode={flag.value_type === "number" ? "decimal" : "text"}
              aria-label={`${flag.label} value`}
            />
            <Button
              size="sm"
              variant={dirty ? "default" : "outline"}
              disabled={!dirty || saving}
              onClick={() => onSave({ value, reason: reason || undefined })}
            >
              <Save className="mr-1 h-4 w-4" aria-hidden /> Save
            </Button>
          </div>
        )}
      </div>

      <Input
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Reason for this change (recorded in the audit log)"
        className="mt-3 h-8 text-xs"
        aria-label={`Reason for changing ${flag.label}`}
      />
    </div>
  );
}

function ControlPanelPage() {
  const { user, loading } = useAuth();
  const qc = useQueryClient();
  const fetchFlags = useServerFn(listFeatureFlags);
  const saveFlag = useServerFn(updateFeatureFlag);
  const fetchAudit = useServerFn(listConfigAudit);
  const askAdvisor = useServerFn(askControlPanelAdvisor);

  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [advice, setAdvice] = useState<string | null>(null);
  const [thinking, setThinking] = useState(false);

  const flagsQuery = useQuery({
    queryKey: ["control-panel-flags"],
    queryFn: () => fetchFlags(),
    enabled: !!user,
    retry: false,
  });
  const auditQuery = useQuery({
    queryKey: ["control-panel-audit"],
    queryFn: () => fetchAudit({ data: { limit: 100 } }),
    enabled: !!user,
    retry: false,
  });

  const flags = flagsQuery.data?.flags ?? [];
  const grouped = useMemo(() => {
    const map = new Map<string, FeatureFlag[]>();
    for (const f of flags) map.set(f.category, [...(map.get(f.category) ?? []), f]);
    return [...map.entries()];
  }, [flags]);

  const forbidden =
    flagsQuery.isError && /forbidden|admin/i.test((flagsQuery.error as Error)?.message ?? "");

  async function onSave(key: string, patch: { value?: string; enabled?: boolean; reason?: string }) {
    setSavingKey(key);
    try {
      const res = await saveFlag({ data: { key, ...patch } });
      if (res.changed === 0) toast.info("No change to save");
      else toast.success("Setting updated and recorded in the audit log");
      await qc.invalidateQueries({ queryKey: ["control-panel-flags"] });
      await qc.invalidateQueries({ queryKey: ["control-panel-audit"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save that setting");
    } finally {
      setSavingKey(null);
    }
  }

  async function onAsk() {
    if (prompt.trim().length < 4) return;
    setThinking(true);
    setAdvice(null);
    try {
      const res = await askAdvisor({ data: { request: prompt.trim() } });
      if (res.ok) setAdvice(res.content);
      else toast.error(res.error);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "The advisor could not respond");
    } finally {
      setThinking(false);
    }
  }

  if (loading) {
    return (
      <main className="mx-auto max-w-5xl p-6">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-label="Loading" />
      </main>
    );
  }

  if (!user || forbidden) {
    return (
      <main className="mx-auto max-w-2xl p-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5" aria-hidden /> Admins only
            </CardTitle>
            <CardDescription>
              {user
                ? "Your account does not have the admin role, so the control panel is unavailable."
                : "Sign in with an admin account to open the control panel."}
            </CardDescription>
          </CardHeader>
        </Card>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-semibold">
          <SlidersHorizontal className="h-6 w-6 text-primary" aria-hidden /> AI Control Panel
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Admin-only. Toggle app modules, tune configuration values, and ask the AI advisor what a change would do —
          the advisor never applies anything itself.
        </p>
      </header>

      <Tabs defaultValue="config">
        <TabsList>
          <TabsTrigger value="config">Modules & config</TabsTrigger>
          <TabsTrigger value="advisor">AI advisor</TabsTrigger>
          <TabsTrigger value="history">Change history</TabsTrigger>
        </TabsList>

        <TabsContent value="config" className="space-y-6 pt-4">
          {flagsQuery.isLoading && <p className="text-sm text-muted-foreground">Loading settings…</p>}
          {grouped.map(([category, items]) => (
            <Card key={category}>
              <CardHeader>
                <CardTitle className="text-base">{CATEGORY_LABELS[category] ?? category}</CardTitle>
                <CardDescription>{items.length} setting{items.length === 1 ? "" : "s"}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {items.map((flag) => (
                  <FlagRow
                    key={`${flag.key}-${flag.updated_at}`}
                    flag={flag}
                    saving={savingKey === flag.key}
                    onSave={(patch) => onSave(flag.key, patch)}
                  />
                ))}
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="advisor" className="pt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Bot className="h-4 w-4 text-primary" aria-hidden /> Describe the change you want
              </CardTitle>
              <CardDescription>
                The advisor reads the current settings and returns a plan, the exact settings to change, impact and
                rollback notes. Advisory only — nothing is applied automatically.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                rows={4}
                placeholder="e.g. I want to safely let a small group try live trading without risking more than $50 per order."
                aria-label="Describe the change you want"
              />
              <Button onClick={onAsk} disabled={thinking || prompt.trim().length < 4}>
                {thinking ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : null}
                {thinking ? "Thinking…" : "Get advice"}
              </Button>
              <div aria-live="polite">
                {advice && (
                  <div className="prose prose-sm prose-invert mt-2 max-w-none rounded-lg border border-border/60 bg-card/40 p-4">
                    <ReactMarkdown>{advice}</ReactMarkdown>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="history" className="pt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <History className="h-4 w-4" aria-hidden /> Append-only change history
              </CardTitle>
              <CardDescription>Every configuration change, who made it and why. Entries cannot be edited or deleted.</CardDescription>
            </CardHeader>
            <CardContent>
              {(auditQuery.data?.entries ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">No changes recorded yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <caption className="sr-only">Configuration change history</caption>
                    <thead>
                      <tr className="text-left text-xs uppercase text-muted-foreground">
                        <th scope="col" className="py-2 pr-4">When</th>
                        <th scope="col" className="py-2 pr-4">Setting</th>
                        <th scope="col" className="py-2 pr-4">Change</th>
                        <th scope="col" className="py-2">Reason</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(auditQuery.data?.entries ?? []).map((e) => (
                        <tr key={e.id} className="border-t border-border/50">
                          <td className="py-2 pr-4 whitespace-nowrap text-muted-foreground">{fmt(e.created_at)}</td>
                          <td className="py-2 pr-4"><code className="text-xs">{e.flag_key}</code></td>
                          <td className="py-2 pr-4">
                            <span className="text-muted-foreground line-through">{e.old_value ?? "—"}</span>{" → "}
                            <span className="font-medium">{e.new_value ?? "—"}</span>
                          </td>
                          <td className="py-2 text-muted-foreground">{e.reason ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </main>
  );
}
