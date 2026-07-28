import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Loader2, Play, Terminal, ShieldCheck, Copy, ScrollText } from "lucide-react";
import { listConsoleTools, runConsoleToolCall } from "@/lib/mcp-console.functions";
import {
  QuotaMeter,
  ThrottleBanner,
  type ConsoleQuotaView,
  type ConsoleThrottleView,
} from "@/components/mcp-quota";

export const Route = createFileRoute("/mcp-console")({
  head: () => ({
    meta: [
      { title: "MCP test console — run agent tool calls | PumpPilot AI" },
      {
        name: "description",
        content:
          "Run PumpPilot AI's MCP tools in mock or live mode, inspect sanitized responses, and copy the audit correlation ID for every call.",
      },
      { property: "og:title", content: "MCP test console — run agent tool calls" },
      {
        property: "og:description",
        content:
          "Test agent tool calls in mock or live mode with sanitized responses and audit IDs.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: McpConsolePage,
});

type ToolMeta = {
  name: string;
  title: string;
  description: string;
  readOnly: boolean;
  exampleInput: string;
};

type RunResult = {
  mode: "mock" | "live";
  tool: string;
  auditId: string | null;
  correlationId: string | null;
  durationMs: number;
  isError: boolean;
  text: string;
  structuredJson: string;
  quota: ConsoleQuotaView | null;
  throttle: ConsoleThrottleView | null;
};

function McpConsolePage() {
  const loadTools = useServerFn(listConsoleTools);
  const runTool = useServerFn(runConsoleToolCall);

  const [tools, setTools] = useState<ToolMeta[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [mode, setMode] = useState<"mock" | "live">("mock");
  const [input, setInput] = useState("{}");
  const [running, setRunning] = useState(false);
  const [history, setHistory] = useState<RunResult[]>([]);

  useEffect(() => {
    loadTools()
      .then((list) => {
        setTools(list as ToolMeta[]);
        if (list.length) {
          setSelected(list[0].name);
          setInput(list[0].exampleInput);
        }
      })
      .catch(() => toast.error("Could not load the tool catalog."));
  }, [loadTools]);

  const active = useMemo(() => tools.find((t) => t.name === selected), [tools, selected]);

  function pickTool(name: string) {
    setSelected(name);
    const t = tools.find((x) => x.name === name);
    if (t) setInput(t.exampleInput);
  }

  async function run() {
    if (!selected) return;
    setRunning(true);
    try {
      const result = (await runTool({ data: { tool: selected, mode, input } })) as RunResult;
      setHistory((h) => [result, ...h].slice(0, 20));
      if (result.throttle)
        toast.error(
          `Rate limited — retry in ${result.throttle.retryAfterSeconds}s (correlation ${result.correlationId ?? "n/a"})`,
        );
      else if (result.isError) toast.error("Tool returned an error — see the response below.");
      else toast.success(`${mode === "mock" ? "Mock" : "Live"} call completed in ${result.durationMs}ms`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Tool call failed.");
    } finally {
      setRunning(false);
    }
  }

  function copy(value: string, label: string) {
    void navigator.clipboard.writeText(value);
    toast.success(`${label} copied`);
  }

  return (
    <AppShell>
      <div className="space-y-6">
        <header className="space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
              <Terminal className="h-5 w-5 text-primary" /> MCP test console
            </h1>
            <Badge variant="outline">Agent integrations</Badge>
          </div>
          <p className="text-sm text-muted-foreground max-w-3xl">
            Run any exposed MCP tool exactly as a connected AI agent would. <strong>Mock</strong> mode
            returns fixtures and never touches your data or the audit trail. <strong>Live</strong> mode
            executes the real handler as you, writes an audit row, and counts against the agent rate
            limit. Responses are sanitized — tokens, keys and emails are redacted before display.
          </p>
          <p className="text-xs text-muted-foreground">
            Audit rows for live calls appear in{" "}
            <Link to="/settings" className="underline underline-offset-4">
              Settings → Audit trail
            </Link>
            .
          </p>
        </header>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Request</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs uppercase tracking-wide text-muted-foreground">Tool</label>
                <Select value={selected} onValueChange={pickTool}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a tool" />
                  </SelectTrigger>
                  <SelectContent>
                    {tools.map((t) => (
                      <SelectItem key={t.name} value={t.name}>
                        {t.title} · {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {active && (
                  <p className="text-xs text-muted-foreground">
                    {active.description}{" "}
                    <Badge variant={active.readOnly ? "secondary" : "destructive"} className="ml-1">
                      {active.readOnly ? "read-only" : "writes data"}
                    </Badge>
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <label className="text-xs uppercase tracking-wide text-muted-foreground">Mode</label>
                <Tabs value={mode} onValueChange={(v) => setMode(v as "mock" | "live")}>
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="mock">Mock (safe)</TabsTrigger>
                    <TabsTrigger value="live">Live (audited)</TabsTrigger>
                  </TabsList>
                </Tabs>
                {mode === "live" && active && !active.readOnly && (
                  <p className="text-xs text-destructive">
                    This tool writes data. A live call will persist a real record.
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <label className="text-xs uppercase tracking-wide text-muted-foreground">
                  Input (JSON)
                </label>
                <Textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  rows={8}
                  spellCheck={false}
                  className="font-mono text-xs"
                />
              </div>

              <Button onClick={run} disabled={running || !selected} className="w-full">
                {running ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Play className="h-4 w-4" />
                )}
                Run {mode} call
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <ScrollText className="h-4 w-4" /> Responses
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {history.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No calls yet. Pick a tool and run it — results appear here newest first.
                </p>
              )}
              {history.map((r, i) => (
                <div key={`${r.auditId ?? "run"}-${i}`} className="rounded-lg border border-border p-3 space-y-2">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <Badge variant={r.mode === "live" ? "default" : "secondary"}>{r.mode}</Badge>
                    <span className="font-mono">{r.tool}</span>
                    <Badge variant={r.isError ? "destructive" : "outline"}>
                      {r.throttle ? "throttled" : r.isError ? "error" : "ok"}
                    </Badge>
                    <span className="text-muted-foreground">{r.durationMs}ms</span>
                    <span className="ml-auto flex items-center gap-1 text-muted-foreground">
                      <ShieldCheck className="h-3 w-3" /> sanitized
                    </span>
                  </div>

                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-muted-foreground">Audit ID</span>
                    <code className="font-mono break-all">{r.auditId ?? "—"}</code>
                    {r.auditId && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-6 w-6"
                        onClick={() => copy(r.auditId!, "Audit ID")}
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    )}
                  </div>

                  {r.throttle && (
                    <ThrottleBanner
                      throttle={r.throttle}
                      correlationId={r.correlationId}
                      onCopy={copy}
                      onRetry={i === 0 ? run : undefined}
                    />
                  )}

                  {r.quota && <QuotaMeter quota={r.quota} />}

                  <pre className="max-h-72 overflow-auto rounded bg-muted/40 p-2 text-[11px] leading-relaxed font-mono whitespace-pre-wrap">
                    {r.text || r.structuredJson}
                  </pre>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
