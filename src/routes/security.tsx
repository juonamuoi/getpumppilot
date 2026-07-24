import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { DisclaimerBanner } from "@/components/disclaimer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import type { DateRange } from "react-day-picker";
import {
  ShieldCheck,
  ShieldAlert,
  Flag,
  Trash2,
  Download,
  Search,
  Plus,
  AlertTriangle,
  KeyRound,
  Link2,
  Fingerprint,
  CheckCircle2,
  XCircle,
  CalendarIcon,
  BarChart3,
  X,
} from "lucide-react";
import { toast } from "sonner";
import {
  useSecurity,
  type Report,
  type ReportKind,
  type ReportCategory,
  type Severity,
} from "@/lib/security-store";

export const Route = createFileRoute("/security")({
  head: () => ({
    meta: [
      { title: "Security Center — PumpPilot AI" },
      {
        name: "description",
        content:
          "Anti-phishing status, scam blocklist, credential-leak guards and reported incidents for PumpPilot AI.",
      },
      { property: "og:title", content: "Security Center — PumpPilot AI" },
      {
        property: "og:description",
        content:
          "Configure phishing protection, review blocked domains and reported scam attempts.",
      },
    ],
  }),
  component: SecurityPage,
});

function SecurityPage() {
  const security = useSecurity();
  const origin = useMemo(() => security.checkOriginSafe(), [security]);
  const criticalCount = security.reports.filter((r) => r.severity === "critical").length;

  return (
    <AppShell>
      <div className="space-y-5">
        <div>
          <h1 className="text-2xl font-bold sm:text-3xl">Security Center</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Phishing detection, credential-leak guards and scam reporting for your wallet session.
          </p>
        </div>

        <DisclaimerBanner />

        <div className="grid gap-3 sm:grid-cols-3">
          <StatusTile
            label="Origin"
            value={origin.ok ? "Verified" : "Flagged"}
            good={origin.ok}
            icon={<Fingerprint className="h-4 w-4" />}
            detail={
              origin.ok
                ? "This origin matches the trusted domain list."
                : origin.matches[0]?.detail
            }
          />
          <StatusTile
            label="Phishing blocker"
            value={security.settings.phishingBlockerEnabled ? "Active" : "Off"}
            good={security.settings.phishingBlockerEnabled}
            icon={<ShieldCheck className="h-4 w-4" />}
            detail={`${security.blocklist.length} domains on blocklist`}
          />
          <StatusTile
            label="Critical incidents"
            value={String(criticalCount)}
            good={criticalCount === 0}
            icon={<AlertTriangle className="h-4 w-4" />}
            detail={
              criticalCount === 0
                ? "No blocked credential leaks in this session."
                : "See incident log below."
            }
          />
        </div>

        <Tabs defaultValue="protections">
          <TabsList className="w-full sm:w-auto">
            <TabsTrigger value="protections" className="flex-1 sm:flex-none">
              Protections
            </TabsTrigger>
            <TabsTrigger value="blocklist" className="flex-1 sm:flex-none">
              Blocklist
            </TabsTrigger>
            <TabsTrigger value="incidents" className="flex-1 sm:flex-none">
              Incidents
            </TabsTrigger>
          </TabsList>

          <TabsContent value="protections" className="mt-5">
            <ProtectionsPanel />
          </TabsContent>
          <TabsContent value="blocklist" className="mt-5">
            <BlocklistPanel />
          </TabsContent>
          <TabsContent value="incidents" className="mt-5">
            <IncidentsPanel />
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  );
}

/* ------------------------------- Status tile ------------------------------- */

function StatusTile({
  label,
  value,
  good,
  icon,
  detail,
}: {
  label: string;
  value: string;
  good: boolean;
  icon: React.ReactNode;
  detail?: string;
}) {
  return (
    <Card
      className={`border-border/60 bg-card/60 ${
        good ? "" : "border-rose-500/40 bg-rose-500/5"
      }`}
    >
      <CardContent className="p-4">
        <div
          className={`flex items-center gap-2 text-xs font-semibold uppercase tracking-wide ${
            good ? "text-emerald-300" : "text-rose-300"
          }`}
        >
          {icon}
          {label}
        </div>
        <div className="mt-2 text-2xl font-bold">{value}</div>
        {detail && (
          <div className="mt-1 text-xs text-muted-foreground line-clamp-2">{detail}</div>
        )}
      </CardContent>
    </Card>
  );
}

/* ------------------------------ Protections ------------------------------ */

function ProtectionsPanel() {
  const { settings, updateSettings } = useSecurity();
  const rows: Array<{
    key: keyof typeof settings;
    icon: React.ReactNode;
    title: string;
    desc: string;
  }> = [
    {
      key: "phishingBlockerEnabled",
      icon: <ShieldCheck className="h-4 w-4" />,
      title: "Phishing blocker",
      desc: "Block navigation to known scam domains and warn on impersonation attempts.",
    },
    {
      key: "seedPhraseGuardEnabled",
      icon: <KeyRound className="h-4 w-4" />,
      title: "Seed-phrase paste guard",
      desc: "Detect and block 12–24 word recovery phrases pasted into the wallet dialog.",
    },
    {
      key: "privateKeyGuardEnabled",
      icon: <Fingerprint className="h-4 w-4" />,
      title: "Private-key paste guard",
      desc: "Detect 64-character hex private keys and block the paste before it lands.",
    },
    {
      key: "linkScannerEnabled",
      icon: <Link2 className="h-4 w-4" />,
      title: "Link scanner",
      desc: "Scan URLs for punycode/homograph tricks and PumpPilot look-alikes.",
    },
    {
      key: "strictDomainCheck",
      icon: <ShieldAlert className="h-4 w-4" />,
      title: "Strict origin check",
      desc: "Only trust the official PumpPilot domain and Lovable preview URLs.",
    },
    {
      key: "autoReportEnabled",
      icon: <Flag className="h-4 w-4" />,
      title: "Auto-report incidents",
      desc: "Automatically log blocked events to the incident feed below.",
    },
  ];

  return (
    <Card className="border-border/60 bg-card/60">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Client-side protections</CardTitle>
      </CardHeader>
      <CardContent className="divide-y divide-border/60 p-0">
        {rows.map((row) => (
          <div
            key={row.key}
            className="flex items-center justify-between gap-3 px-4 py-3"
          >
            <div className="flex min-w-0 items-start gap-3">
              <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-muted/40 text-muted-foreground">
                {row.icon}
              </div>
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold">{row.title}</div>
                <div className="text-xs text-muted-foreground">{row.desc}</div>
              </div>
            </div>
            <Switch
              checked={settings[row.key]}
              onCheckedChange={(v) => {
                updateSettings({ [row.key]: v } as Partial<typeof settings>);
                toast.message(`${row.title}: ${v ? "enabled" : "disabled"}`);
              }}
            />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

/* -------------------------------- Blocklist ------------------------------- */

function BlocklistPanel() {
  const { blocklist, addBlockedDomain, removeBlockedDomain } = useSecurity();
  const [domain, setDomain] = useState("");
  const [reason, setReason] = useState("");
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return blocklist;
    return blocklist.filter(
      (e) => e.domain.includes(t) || e.reason.toLowerCase().includes(t),
    );
  }, [blocklist, q]);

  const add = () => {
    const ok = addBlockedDomain(domain, reason || "User-added");
    if (!ok) {
      toast.error("Enter a valid domain (e.g. wallet-verify.example)");
      return;
    }
    toast.success(`Blocked ${domain.trim().toLowerCase()}`);
    setDomain("");
    setReason("");
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_1.4fr]">
      <Card className="border-border/60 bg-card/60">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Block a domain</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Domain</Label>
            <Input
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="wallet-verify.example"
              autoComplete="off"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Reason (optional)</Label>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Fake airdrop / drainer"
              autoComplete="off"
            />
          </div>
          <Button onClick={add} className="w-full">
            <Plus className="mr-2 h-4 w-4" /> Add to blocklist
          </Button>
          <p className="text-[11px] text-muted-foreground">
            Built-in entries can't be removed. Your entries persist for this session.
          </p>
        </CardContent>
      </Card>

      <Card className="border-border/60 bg-card/60">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center justify-between text-base">
            <span>Phishing blocklist</span>
            <Badge variant="outline" className="border-emerald-500/30 text-emerald-300">
              {blocklist.length} domain{blocklist.length === 1 ? "" : "s"}
            </Badge>
          </CardTitle>
          <div className="relative mt-3">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search domain or reason…"
              className="pl-9"
            />
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">
              No entries match your search.
            </div>
          ) : (
            <div className="divide-y divide-border/60">
              {filtered.map((e) => (
                <div
                  key={e.domain}
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-4 py-3"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-mono text-sm">{e.domain}</span>
                      <Badge
                        variant="outline"
                        className={
                          e.source === "builtin"
                            ? "border-muted-foreground/30 text-[10px] text-muted-foreground"
                            : e.source === "user"
                              ? "border-emerald-500/30 text-[10px] text-emerald-300"
                              : "border-amber-500/30 text-[10px] text-amber-300"
                        }
                      >
                        {e.source}
                      </Badge>
                    </div>
                    <div className="truncate text-xs text-muted-foreground">{e.reason}</div>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    disabled={e.source === "builtin"}
                    onClick={() => {
                      removeBlockedDomain(e.domain);
                      toast.success(`Removed ${e.domain}`);
                    }}
                    aria-label={`Remove ${e.domain}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* -------------------------------- Incidents ------------------------------- */

const KIND_LABEL: Record<ReportKind, string> = {
  "seed-phrase": "Seed phrase",
  "private-key": "Private key",
  "phishing-domain": "Phishing domain",
  impersonation: "Impersonation",
  "malicious-link": "Malicious link",
  "suspicious-address": "Suspicious address",
  other: "Other",
};

type CsvColumnKey =
  | "id"
  | "timestamp"
  | "severity"
  | "category"
  | "kind"
  | "matched_rule"
  | "source"
  | "origin_url"
  | "blocked"
  | "message"
  | "detail";

const CSV_COLUMNS: {
  key: CsvColumnKey;
  label: string;
  value: (r: Report) => string;
}[] = [
  { key: "id", label: "ID", value: (r) => r.id },
  { key: "timestamp", label: "Timestamp (ISO)", value: (r) => new Date(r.ts).toISOString() },
  { key: "severity", label: "Severity", value: (r) => r.severity },
  { key: "category", label: "Category", value: (r) => r.category ?? "" },
  { key: "kind", label: "Kind", value: (r) => KIND_LABEL[r.kind] ?? r.kind },
  { key: "matched_rule", label: "Matched rule", value: (r) => r.matchedRule ?? "" },
  { key: "source", label: "Source", value: (r) => r.source },
  { key: "origin_url", label: "Origin URL", value: (r) => r.originUrl ?? "" },
  { key: "blocked", label: "Blocked", value: (r) => (r.blocked ? "yes" : "no") },
  { key: "message", label: "Message", value: (r) => r.message },
  { key: "detail", label: "Detail", value: (r) => r.detail ?? "" },
];

const DEFAULT_CSV_COLUMNS: CsvColumnKey[] = CSV_COLUMNS.map((c) => c.key);
const CSV_COLUMNS_STORAGE_KEY = "pumppilot.security.csvColumns.v1";

function loadCsvColumns(): CsvColumnKey[] {
  if (typeof window === "undefined") return DEFAULT_CSV_COLUMNS;
  try {
    const raw = window.localStorage.getItem(CSV_COLUMNS_STORAGE_KEY);
    if (!raw) return DEFAULT_CSV_COLUMNS;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return DEFAULT_CSV_COLUMNS;
    const valid = new Set(DEFAULT_CSV_COLUMNS);
    const picked = parsed.filter((k): k is CsvColumnKey => typeof k === "string" && valid.has(k as CsvColumnKey));
    return picked.length > 0 ? picked : DEFAULT_CSV_COLUMNS;
  } catch {
    return DEFAULT_CSV_COLUMNS;
  }
}

function IncidentsPanel() {
  const { reports, clearReports } = useSecurity();
  const [q, setQ] = useState("");
  const [severity, setSeverity] = useState<"all" | Severity>("all");
  const [kind, setKind] = useState<"all" | ReportKind>("all");
  const [category, setCategory] = useState<"all" | ReportCategory>("all");
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const [csvColumns, setCsvColumnsState] = useState<CsvColumnKey[]>(() => loadCsvColumns());
  const setCsvColumns = (next: CsvColumnKey[]) => {
    // Preserve canonical ordering from CSV_COLUMNS
    const set = new Set(next);
    const ordered = DEFAULT_CSV_COLUMNS.filter((k) => set.has(k));
    setCsvColumnsState(ordered);
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(CSV_COLUMNS_STORAGE_KEY, JSON.stringify(ordered));
      } catch {
        /* ignore quota */
      }
    }
  };
  const toggleCsvColumn = (key: CsvColumnKey) => {
    setCsvColumns(
      csvColumns.includes(key) ? csvColumns.filter((k) => k !== key) : [...csvColumns, key],
    );
  };

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    const fromMs = dateRange?.from
      ? new Date(dateRange.from).setHours(0, 0, 0, 0)
      : undefined;
    const toMs = dateRange?.to
      ? new Date(dateRange.to).setHours(23, 59, 59, 999)
      : dateRange?.from
        ? new Date(dateRange.from).setHours(23, 59, 59, 999)
        : undefined;
    return reports.filter((r) => {
      if (severity !== "all" && r.severity !== severity) return false;
      if (kind !== "all" && r.kind !== kind) return false;
      if (category !== "all" && (r.category ?? "other") !== category) return false;
      if (fromMs !== undefined && r.ts < fromMs) return false;
      if (toMs !== undefined && r.ts > toMs) return false;
      if (!t) return true;
      return (
        r.message.toLowerCase().includes(t) ||
        (r.detail?.toLowerCase().includes(t) ?? false) ||
        r.source.toLowerCase().includes(t)
      );
    });
  }, [reports, q, severity, kind, category, dateRange]);

  const activeFilterCount =
    (severity !== "all" ? 1 : 0) +
    (kind !== "all" ? 1 : 0) +
    (category !== "all" ? 1 : 0) +
    (dateRange?.from ? 1 : 0) +
    (q.trim() ? 1 : 0);

  const setPresetDays = (days: number) => {
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - (days - 1));
    setDateRange({ from, to });
  };

  const resetFilters = () => {
    setQ("");
    setSeverity("all");
    setKind("all");
    setCategory("all");
    setDateRange(undefined);
  };

  const rangeLabel = dateRange?.from
    ? dateRange.to && dateRange.to.getTime() !== dateRange.from.getTime()
      ? `${format(dateRange.from, "MMM d")} – ${format(dateRange.to, "MMM d")}`
      : format(dateRange.from, "MMM d, yyyy")
    : "Any date";

  const exportCsv = () => {
    if (filtered.length === 0) {
      toast.error("No incidents to export");
      return;
    }
    const esc = (v: unknown) => {
      const s = v == null ? "" : String(v);
      return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = [
      "id",
      "timestamp",
      "severity",
      "category",
      "kind",
      "matched_rule",
      "source",
      "origin_url",
      "blocked",
      "message",
      "detail",
    ];
    const rows = filtered.map((r) => [
      r.id,
      new Date(r.ts).toISOString(),
      r.severity,
      r.category ?? "",
      KIND_LABEL[r.kind] ?? r.kind,
      r.matchedRule ?? "",
      r.source,
      r.originUrl ?? "",
      r.blocked ? "yes" : "no",
      r.message,
      r.detail ?? "",
    ]);
    const csv =
      "\ufeff" +
      [header, ...rows].map((row) => row.map(esc).join(",")).join("\r\n") +
      "\r\n";
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    a.href = url;
    a.download = `pumppilot-incidents-${stamp}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast.success(
      `Exported ${filtered.length} incident${filtered.length === 1 ? "" : "s"}${
        activeFilterCount ? ` (${activeFilterCount} filter${activeFilterCount === 1 ? "" : "s"})` : ""
      }`,
    );
  };

  const exportJson = () => {
    if (filtered.length === 0) {
      toast.error("No incidents to export");
      return;
    }
    const nowIso = new Date().toISOString();
    const payload = {
      schema: "pumppilot.incidents",
      version: 1,
      exportedAt: nowIso,
      source: typeof window !== "undefined" ? window.location.href : "",
      totalIncidents: reports.length,
      exportedCount: filtered.length,
      filters: {
        query: q.trim() || null,
        severity,
        kind,
        category,
        dateRange: dateRange?.from
          ? {
              from: new Date(dateRange.from).toISOString(),
              to: (dateRange.to ?? dateRange.from
                ? new Date(dateRange.to ?? dateRange.from!).toISOString()
                : null),
            }
          : null,
      },
      incidents: filtered.map((r) => ({
        id: r.id,
        ts: r.ts,
        timestamp: new Date(r.ts).toISOString(),
        kind: r.kind,
        kindLabel: KIND_LABEL[r.kind] ?? r.kind,
        severity: r.severity,
        category: r.category ?? null,
        matchedRule: r.matchedRule ?? null,
        source: r.source,
        originUrl: r.originUrl ?? null,
        blocked: r.blocked ?? false,
        message: r.message,
        detail: r.detail ?? null,
      })),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const stamp = nowIso.replace(/[:.]/g, "-").slice(0, 19);
    a.href = url;
    a.download = `pumppilot-incidents-${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast.success(
      `Exported ${filtered.length} incident${filtered.length === 1 ? "" : "s"} as JSON${
        activeFilterCount ? ` (${activeFilterCount} filter${activeFilterCount === 1 ? "" : "s"})` : ""
      }`,
    );
  };

  const CATEGORY_LABEL: Record<ReportCategory, string> = {
    "credential-leak": "Credential leak",
    phishing: "Phishing",
    impersonation: "Impersonation",
    origin: "Origin",
    "user-report": "User report",
    other: "Other",
  };

  const stats = useMemo(() => {
    const total = filtered.length;
    const bump = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);
    const byCategory = new Map<string, number>();
    const byOrigin = new Map<string, number>();
    const byRule = new Map<string, number>();
    const bySeverity = new Map<string, number>();
    const buckets = new Map<string, number>();
    const now = Date.now();
    const BUCKETS: { key: string; label: string; ms: number }[] = [
      { key: "1h", label: "Last hour", ms: 60 * 60_000 },
      { key: "24h", label: "Last 24h", ms: 24 * 60 * 60_000 },
      { key: "7d", label: "Last 7d", ms: 7 * 24 * 60 * 60_000 },
      { key: "30d", label: "Last 30d", ms: 30 * 24 * 60 * 60_000 },
      { key: "older", label: "Older", ms: Infinity },
    ];
    for (const b of BUCKETS) buckets.set(b.key, 0);
    let blocked = 0;
    for (const r of filtered) {
      bump(byCategory, r.category ?? "other");
      bump(byOrigin, r.originUrl?.trim() || "(unknown)");
      bump(byRule, r.matchedRule?.trim() || "(none)");
      bump(bySeverity, r.severity);
      if (r.blocked) blocked += 1;
      const age = now - r.ts;
      const b = BUCKETS.find((x) => age <= x.ms) ?? BUCKETS[BUCKETS.length - 1];
      buckets.set(b.key, (buckets.get(b.key) ?? 0) + 1);
    }
    const sortDesc = (m: Map<string, number>) =>
      [...m.entries()].sort((a, b) => b[1] - a[1]);
    return {
      total,
      blocked,
      bySeverity: sortDesc(bySeverity),
      byCategory: sortDesc(byCategory),
      byOrigin: sortDesc(byOrigin).slice(0, 8),
      byRule: sortDesc(byRule).slice(0, 8),
      buckets: BUCKETS.map((b) => ({ label: b.label, count: buckets.get(b.key) ?? 0 })),
    };
  }, [filtered]);

  return (
    <Card className="border-border/60 bg-card/60">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base">Incident log</CardTitle>
          <div className="flex items-center gap-1">
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={filtered.length === 0}
                  title={`Summary of ${filtered.length} filtered incident(s)`}
                >
                  <BarChart3 className="mr-1 h-3.5 w-3.5" /> Summary
                  {activeFilterCount > 0 && (
                    <Badge
                      variant="outline"
                      className="ml-2 border-sky-500/40 text-[10px] text-sky-300"
                    >
                      {activeFilterCount}
                    </Badge>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-[380px] p-0">
                <div className="border-b border-border/60 px-4 py-3">
                  <div className="text-sm font-medium">Filtered summary</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {stats.total} incident{stats.total === 1 ? "" : "s"} · {stats.blocked} blocked
                    {activeFilterCount > 0
                      ? ` · ${activeFilterCount} active filter${activeFilterCount === 1 ? "" : "s"}`
                      : ""}
                  </div>
                  {stats.bySeverity.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {stats.bySeverity.map(([sev, n]) => (
                        <Badge
                          key={sev}
                          variant="outline"
                          className={cn(
                            "text-[10px]",
                            sev === "high" && "border-red-500/40 text-red-300",
                            sev === "medium" && "border-amber-500/40 text-amber-300",
                            sev === "low" && "border-emerald-500/40 text-emerald-300",
                          )}
                        >
                          {sev} · {n}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
                <div className="max-h-[420px] space-y-4 overflow-y-auto px-4 py-3 text-xs">
                  <StatBlock
                    title="By category"
                    rows={stats.byCategory.map(([k, n]) => ({
                      label: CATEGORY_LABEL[k as ReportCategory] ?? k,
                      count: n,
                    }))}
                    total={stats.total}
                  />
                  <StatBlock
                    title="By matched rule"
                    rows={stats.byRule.map(([k, n]) => ({ label: k, count: n }))}
                    total={stats.total}
                  />
                  <StatBlock
                    title="By origin URL"
                    rows={stats.byOrigin.map(([k, n]) => ({ label: k, count: n, mono: true }))}
                    total={stats.total}
                  />
                  <StatBlock
                    title="By time"
                    rows={stats.buckets.map((b) => ({ label: b.label, count: b.count }))}
                    total={stats.total}
                  />
                </div>
              </PopoverContent>
            </Popover>
            <Button
              variant="ghost"
              size="sm"
              onClick={exportCsv}
              disabled={filtered.length === 0}
              title={
                activeFilterCount
                  ? `Export ${filtered.length} filtered incident(s)`
                  : `Export all ${filtered.length} incident(s)`
              }
            >
              <Download className="mr-1 h-3.5 w-3.5" /> Export CSV
              {activeFilterCount > 0 && (
                <Badge
                  variant="outline"
                  className="ml-2 border-emerald-500/40 text-[10px] text-emerald-300"
                >
                  {activeFilterCount}
                </Badge>
              )}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={exportJson}
              disabled={filtered.length === 0}
              title={
                activeFilterCount
                  ? `Export ${filtered.length} filtered incident(s) as JSON`
                  : `Export all ${filtered.length} incident(s) as JSON`
              }
            >
              <Download className="mr-1 h-3.5 w-3.5" /> Export JSON
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                clearReports();
                toast.success("Incident log cleared");
              }}
              disabled={reports.length === 0}
            >
              <Trash2 className="mr-1 h-3.5 w-3.5" /> Clear
            </Button>
          </div>
        </div>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <div className="relative min-w-[200px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search message, detail or source…"
              className="pl-9"
            />
          </div>
          <Select value={severity} onValueChange={(v) => setSeverity(v as typeof severity)}>
            <SelectTrigger className="sm:w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All severities</SelectItem>
              <SelectItem value="critical">Critical</SelectItem>
              <SelectItem value="warn">Warning</SelectItem>
              <SelectItem value="info">Info</SelectItem>
            </SelectContent>
          </Select>
          <Select value={category} onValueChange={(v) => setCategory(v as typeof category)}>
            <SelectTrigger className="sm:w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {(Object.keys(CATEGORY_LABEL) as ReportCategory[]).map((c) => (
                <SelectItem key={c} value={c}>
                  {CATEGORY_LABEL[c]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={kind} onValueChange={(v) => setKind(v as typeof kind)}>
            <SelectTrigger className="sm:w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All kinds</SelectItem>
              {(Object.keys(KIND_LABEL) as ReportKind[]).map((k) => (
                <SelectItem key={k} value={k}>
                  {KIND_LABEL[k]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "justify-start gap-2 text-left font-normal sm:w-56",
                  !dateRange?.from && "text-muted-foreground",
                )}
              >
                <CalendarIcon className="h-4 w-4" />
                {rangeLabel}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <div className="flex flex-wrap gap-1 border-b border-border/60 p-2">
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setPresetDays(1)}>
                  Today
                </Button>
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setPresetDays(7)}>
                  7d
                </Button>
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setPresetDays(30)}>
                  30d
                </Button>
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setPresetDays(90)}>
                  90d
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs"
                  onClick={() => setDateRange(undefined)}
                >
                  Clear
                </Button>
              </div>
              <Calendar
                mode="range"
                selected={dateRange}
                onSelect={setDateRange}
                numberOfMonths={2}
                initialFocus
                className={cn("p-3 pointer-events-auto")}
              />
            </PopoverContent>
          </Popover>
          {activeFilterCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="gap-1"
              onClick={resetFilters}
              title="Reset all filters"
            >
              <X className="h-3.5 w-3.5" /> Reset
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {filtered.length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">
            {reports.length === 0
              ? "No incidents recorded. Blocked pastes, flagged domains and scam reports will appear here."
              : "No incidents match these filters."}
          </div>
        ) : (
          <div className="divide-y divide-border/60">
            {filtered.map((r) => (
              <IncidentRow key={r.id} r={r} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function IncidentRow({ r }: { r: Report }) {
  const color =
    r.severity === "critical"
      ? "text-rose-300"
      : r.severity === "warn"
        ? "text-amber-300"
        : "text-emerald-300";
  const Icon =
    r.severity === "critical" ? XCircle : r.severity === "warn" ? AlertTriangle : CheckCircle2;
  return (
    <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3 px-4 py-3">
      <div className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-muted/40 ${color}`}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="truncate text-sm font-semibold">{r.message}</span>
          <Badge
            variant="outline"
            className="border-border/60 text-[10px] uppercase tracking-wide text-muted-foreground"
          >
            {KIND_LABEL[r.kind]}
          </Badge>
          {r.blocked && (
            <Badge
              variant="outline"
              className="border-rose-500/30 text-[10px] uppercase tracking-wide text-rose-300"
            >
              Blocked
            </Badge>
          )}
        </div>
        {r.detail && (
          <div className="mt-0.5 text-xs text-muted-foreground">{r.detail}</div>
        )}
        <div className="mt-0.5 text-[11px] text-muted-foreground">
          from {r.source} · {relativeTime(r.ts)}
        </div>
      </div>
    </div>
  );
}

function relativeTime(ts: number) {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function StatBlock({
  title,
  rows,
  total,
}: {
  title: string;
  rows: { label: string; count: number; mono?: boolean }[];
  total: number;
}) {
  if (rows.length === 0) return null;
  const max = Math.max(...rows.map((r) => r.count), 1);
  return (
    <div>
      <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {title}
      </div>
      <div className="space-y-1.5">
        {rows.map((r, i) => {
          const pct = total > 0 ? Math.round((r.count / total) * 100) : 0;
          const barW = `${Math.max(4, (r.count / max) * 100)}%`;
          return (
            <div key={`${r.label}-${i}`} className="space-y-0.5">
              <div className="flex items-center justify-between gap-2">
                <span
                  className={cn(
                    "min-w-0 flex-1 truncate",
                    r.mono && "font-mono text-[11px]",
                  )}
                  title={r.label}
                >
                  {r.label}
                </span>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  {r.count} · {pct}%
                </span>
              </div>
              <div className="h-1 overflow-hidden rounded bg-muted/40">
                <div className="h-full bg-sky-500/60" style={{ width: barW }} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
