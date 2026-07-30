/**
 * Server-only helpers for the admin storage-audit export endpoint.
 *
 * Kept out of the route file so the route stays a thin HTTP wrapper: it owns
 * auth, validation and the streamed Response, while paging and serialisation
 * live here.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const EXPORT_COLUMNS = [
  "id",
  "created_at",
  "user_id",
  "bucket",
  "object_path",
  "operation",
  "decision",
  "reason",
  "path_owner_id",
  "correlation_id",
] as const;

export type ExportColumn = (typeof EXPORT_COLUMNS)[number];
export type ExportRow = Record<ExportColumn, string | null>;

export type ExportQuery = {
  format: "csv" | "json";
  hours: number;
  bucket: string;
  decision: "allow" | "deny" | "all";
  operation: string;
  q: string;
  /** Max rows across all pages. */
  limit: number;
  /** Rows fetched (and streamed) per database page. */
  pageSize: number;
  /** Rows to skip before the first exported row. */
  offset: number;
};

/** Parses and hard-bounds every user-supplied query parameter. */
export function parseExportQuery(url: URL): ExportQuery {
  const num = (key: string, dflt: number, min: number, max: number) => {
    const raw = Number(url.searchParams.get(key));
    return Number.isFinite(raw) ? Math.min(Math.max(raw, min), max) : dflt;
  };
  const decision = url.searchParams.get("decision");
  return {
    format: url.searchParams.get("format") === "json" ? "json" : "csv",
    hours: num("hours", 24, 1, 720),
    bucket: (url.searchParams.get("bucket") ?? "all").slice(0, 64),
    decision: decision === "allow" || decision === "deny" ? decision : "all",
    operation: (url.searchParams.get("operation") ?? "all").slice(0, 32),
    q: (url.searchParams.get("q") ?? "").slice(0, 120),
    limit: num("limit", 5000, 1, 50_000),
    pageSize: num("pageSize", 500, 50, 1000),
    offset: num("offset", 0, 0, 1_000_000),
  };
}

/**
 * Verifies the bearer token and the caller's admin role using the CALLER's
 * own client (never service-role), mirroring `assertAdmin`.
 */
export async function authorizeAdmin(
  request: Request,
): Promise<{ ok: true; userId: string } | { ok: false; status: number; error: string }> {
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  if (!token) return { ok: false, status: 401, error: "missing_bearer_token" };

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return { ok: false, status: 500, error: "backend_not_configured" };

  const caller = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        h.set("apikey", key);
        h.set("Authorization", `Bearer ${token}`);
        return fetch(input, { ...init, headers: h });
      },
    },
  });

  const { data: userData, error: userErr } = await caller.auth.getUser(token);
  const userId = userData?.user?.id;
  if (userErr || !userId) return { ok: false, status: 401, error: "invalid_token" };

  const { data: isAdmin, error } = await (
    caller as unknown as {
      rpc: (
        fn: string,
        args: Record<string, unknown>,
      ) => Promise<{ data: boolean | null; error: unknown }>;
    }
  ).rpc("has_role", { _user_id: userId, _role: "admin" });
  if (error || isAdmin !== true) return { ok: false, status: 403, error: "admin_role_required" };

  return { ok: true, userId };
}

/** Fetches one page of filtered audit rows, newest first. */
export async function fetchAuditPage(
  admin: SupabaseClient<never>,
  query: ExportQuery,
  from: number,
  to: number,
): Promise<ExportRow[]> {
  const since = new Date(Date.now() - query.hours * 3600_000).toISOString();
  let q = (
    admin as unknown as {
      from: (t: string) => any;
    }
  )
    .from("storage_access_audit")
    .select(EXPORT_COLUMNS.join(","))
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .range(from, to);

  if (query.bucket !== "all") q = q.eq("bucket", query.bucket);
  if (query.decision !== "all") q = q.eq("decision", query.decision);
  if (query.operation !== "all") q = q.eq("operation", query.operation);
  if (query.q) {
    const term = query.q.replace(/[%,()]/g, "");
    q = q.or(
      `object_path.ilike.%${term}%,correlation_id.ilike.%${term}%,reason.ilike.%${term}%`,
    );
  }

  const { data, error } = (await q) as { data: ExportRow[] | null; error: { message: string } | null };
  if (error) throw new Error(error.message);
  return data ?? [];
}

function csvCell(value: string | null): string {
  const v = value ?? "";
  return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function csvHeader(): string {
  return `${EXPORT_COLUMNS.join(",")}\n`;
}

export function csvRow(row: ExportRow): string {
  return `${EXPORT_COLUMNS.map((c) => csvCell(row[c] == null ? null : String(row[c]))).join(",")}\n`;
}

export function exportFilename(query: ExportQuery): string {
  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
  return `storage-audit-${query.decision}-${stamp}.${query.format}`;
}
