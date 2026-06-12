import { supabase } from "../auth/supabase";

export type AuditCategory = "audit" | "sync" | "auth" | "error";
export type AuditStatus = "success" | "error" | "info";

type AuditMetadata = Record<string, unknown>;

export type AuditLogEntry = {
  id: string;
  actorUserId?: string | null;
  organizationId?: string | null;
  category: AuditCategory;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  status: AuditStatus;
  source: string;
  durationMs?: number | null;
  errorMessage?: string | null;
  metadata: AuditMetadata;
  createdAt: number;
};

export type AuditEventInput = {
  actorUserId?: string | null;
  organizationId?: string | null;
  category: AuditCategory;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  status: AuditStatus;
  source?: string;
  durationMs?: number | null;
  errorMessage?: string | null;
  metadata?: AuditMetadata;
};

function sanitizeErrorMessage(errorMessage: string | null | undefined) {
  if (!errorMessage) {
    return null;
  }

  return errorMessage.slice(0, 500);
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    const parts = ["message", "details", "hint", "code"]
      .map((key) => {
        const value = record[key];
        return typeof value === "string" && value.trim()
          ? `${key}: ${value.trim()}`
          : null;
      })
      .filter(Boolean);

    if (parts.length) {
      return parts.join(" | ");
    }
  }

  return "Unknown error";
}

export async function recordAuditEvent(input: AuditEventInput): Promise<void> {
  const { error } = await supabase.from("audit_log").insert({
    actor_user_id: input.actorUserId ?? null,
    organization_id: input.organizationId ?? null,
    category: input.category,
    action: input.action,
    target_type: input.targetType ?? null,
    target_id: input.targetId ?? null,
    status: input.status,
    source: input.source ?? "mobile",
    duration_ms: input.durationMs ?? null,
    error_message: sanitizeErrorMessage(input.errorMessage),
    metadata: input.metadata ?? {},
  });

  if (error) {
    throw error;
  }
}

export async function recordAuditEventBestEffort(input: AuditEventInput): Promise<void> {
  try {
    await recordAuditEvent(input);
  } catch (error) {
    console.warn("Failed to record audit event", getErrorMessage(error));
  }
}

export async function listAuditLogEntries(limit = 100): Promise<AuditLogEntry[]> {
  const { data, error } = await supabase
    .from("audit_log")
    .select(
      "id, actor_user_id, organization_id, category, action, target_type, target_id, status, source, duration_ms, error_message, metadata, created_at"
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw error;
  }

  return (data ?? []).map((row: any) => ({
    id: String(row.id),
    actorUserId: row.actor_user_id ? String(row.actor_user_id) : null,
    organizationId: row.organization_id ? String(row.organization_id) : null,
    category: row.category,
    action: String(row.action ?? ""),
    targetType: row.target_type ? String(row.target_type) : null,
    targetId: row.target_id ? String(row.target_id) : null,
    status: row.status,
    source: String(row.source ?? "mobile"),
    durationMs: typeof row.duration_ms === "number" ? row.duration_ms : null,
    errorMessage: row.error_message ? String(row.error_message) : null,
    metadata: row.metadata && typeof row.metadata === "object" ? row.metadata : {},
    createdAt: Date.parse(row.created_at),
  }));
}

export async function clearAuditLogEntries(): Promise<number> {
  const { count, error } = await supabase
    .from("audit_log")
    .delete({ count: "exact" })
    .lt("created_at", new Date(Date.now() + 60_000).toISOString());

  if (error) {
    throw error;
  }

  return count ?? 0;
}

export async function withAuditEvent<T>(
  input: Omit<AuditEventInput, "status" | "durationMs" | "errorMessage">,
  action: () => Promise<T>
): Promise<T> {
  const startedAt = Date.now();

  try {
    const result = await action();
    await recordAuditEventBestEffort({
      ...input,
      status: "success",
      durationMs: Date.now() - startedAt,
    });
    return result;
  } catch (error) {
    await recordAuditEventBestEffort({
      ...input,
      status: "error",
      durationMs: Date.now() - startedAt,
      errorMessage: getErrorMessage(error),
    });
    throw error;
  }
}
