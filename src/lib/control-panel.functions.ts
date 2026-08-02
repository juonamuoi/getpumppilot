import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdmin } from "@/lib/admin-guard";

export type FeatureFlag = {
  key: string;
  label: string;
  description: string;
  category: string;
  value_type: "bool" | "number" | "string";
  value: string;
  enabled: boolean;
  sort_order: number;
  updated_at: string;
  updated_by: string | null;
};

export type ConfigAuditRow = {
  id: string;
  flag_key: string;
  field: string;
  old_value: string | null;
  new_value: string | null;
  reason: string | null;
  source: string;
  actor_id: string | null;
  created_at: string;
};

/** Admin-only: read every managed switch / tuning value. */
export const listFeatureFlags = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase as never, context.userId);
    const { data, error } = await context.supabase
      .from("app_feature_flags")
      .select("*")
      .order("category", { ascending: true })
      .order("sort_order", { ascending: true });
    if (error) throw new Error(error.message);
    return { flags: (data ?? []) as unknown as FeatureFlag[] };
  });

const UpdateInput = z.object({
  key: z.string().min(1).max(80),
  value: z.string().max(400).optional(),
  enabled: z.boolean().optional(),
  reason: z.string().max(500).optional(),
});

function validateValue(type: FeatureFlag["value_type"], value: string): string {
  if (type === "bool") {
    if (value !== "true" && value !== "false") throw new Error("Value must be true or false.");
    return value;
  }
  if (type === "number") {
    const n = Number(value);
    if (!Number.isFinite(n)) throw new Error("Value must be a number.");
    return String(n);
  }
  return value;
}

/**
 * Admin-only config write. Every field change is appended to app_config_audit
 * (append-only table) before the caller sees a success result.
 */
export const updateFeatureFlag = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => UpdateInput.parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase as never, context.userId);

    const { data: current, error: readError } = await context.supabase
      .from("app_feature_flags")
      .select("*")
      .eq("key", data.key)
      .maybeSingle();
    if (readError) throw new Error(readError.message);
    if (!current) throw new Error("Unknown setting.");

    const row = current as unknown as FeatureFlag;
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString(), updated_by: context.userId };
    const audits: { field: string; old_value: string; new_value: string }[] = [];

    if (data.value !== undefined && data.value !== row.value) {
      const next = validateValue(row.value_type, data.value);
      patch.value = next;
      audits.push({ field: "value", old_value: row.value, new_value: next });
    }
    if (data.enabled !== undefined && data.enabled !== row.enabled) {
      patch.enabled = data.enabled;
      audits.push({ field: "enabled", old_value: String(row.enabled), new_value: String(data.enabled) });
    }
    if (audits.length === 0) return { ok: true as const, changed: 0 };

    const { error: writeError } = await context.supabase
      .from("app_feature_flags")
      .update(patch as never)
      .eq("key", data.key);
    if (writeError) throw new Error(writeError.message);

    const correlationId = crypto.randomUUID();
    const { error: auditError } = await context.supabase.from("app_config_audit").insert(
      audits.map((a) => ({
        flag_key: data.key,
        field: a.field,
        old_value: a.old_value,
        new_value: a.new_value,
        reason: data.reason ?? null,
        source: "control_panel",
        actor_id: context.userId,
        correlation_id: correlationId,
      })) as never,
    );
    if (auditError) throw new Error(`Change applied but audit failed: ${auditError.message}`);

    return { ok: true as const, changed: audits.length, correlationId };
  });

/** Admin-only: append-only change history. */
export const listConfigAudit = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ limit: z.number().int().min(1).max(500).default(100) }).parse(data ?? {}))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase as never, context.userId);
    const { data: rows, error } = await context.supabase
      .from("app_config_audit")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (error) throw new Error(error.message);
    return { entries: (rows ?? []) as unknown as ConfigAuditRow[] };
  });

const AdviceInput = z.object({ request: z.string().min(4).max(2000) });

/**
 * Advisory only. The model NEVER writes config — it returns a plan, the exact
 * settings it believes should change, impact and risk notes. A human applies it.
 */
export const askControlPanelAdvisor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => AdviceInput.parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase as never, context.userId);

    const { data: flags, error } = await context.supabase
      .from("app_feature_flags")
      .select("key,label,description,category,value_type,value,enabled")
      .order("sort_order", { ascending: true });
    if (error) throw new Error(error.message);

    const key = process.env['LOVABLE_API_KEY'];
    if (!key) throw new Error("Missing LOVABLE_API_KEY");

    const system =
      "You are the PumpPilot AI change advisor for an admin control panel of a live crypto trading app. " +
      "You are ADVISORY ONLY: you cannot change anything. Given the current settings JSON and an admin request, reply in markdown with exactly these sections: " +
      "**Plan** (numbered steps), **Settings to change** (a table: setting key | current | proposed | why), **Impact**, **Risks & rollback**, **Confidence** (low/medium/high with one line of reasoning). " +
      "Only reference setting keys that exist in the provided JSON. If the request cannot be satisfied with these settings, say so plainly and describe what code or product work would be needed instead. " +
      "Be conservative about anything touching live trading, wallet security or money movement, and always flag it. Keep it under 350 words.";

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", "Lovable-API-Key": key },
      body: JSON.stringify({
        model: "google/gemini-3.6-flash",
        messages: [
          { role: "system", content: system },
          {
            role: "user",
            content: `Current settings:\n${JSON.stringify(flags ?? [], null, 2)}\n\nAdmin request:\n${data.request}`,
          },
        ],
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      if (res.status === 429) return { ok: false as const, error: "AI is rate-limited. Try again shortly." };
      if (res.status === 402)
        return { ok: false as const, error: "AI credits exhausted — add credits in workspace billing settings." };
      return { ok: false as const, error: `AI error (${res.status}): ${text.slice(0, 200)}` };
    }

    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    return { ok: true as const, content: json.choices?.[0]?.message?.content?.trim() ?? "" };
  });
