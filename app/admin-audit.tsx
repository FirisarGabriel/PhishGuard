import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import { router, useFocusEffect } from "expo-router";

import { useAuth } from "../src/auth/AuthProvider";
import { useRole } from "../src/auth/useRole";
import {
  clearAuditLogEntries,
  listAuditLogEntries,
  type AuditLogEntry,
} from "../src/observability/audit";
import { theme } from "../src/theme";
import { ui } from "../src/ui";

function formatRelativeTime(timestamp: number) {
  const deltaMinutes = Math.max(0, Math.round((Date.now() - timestamp) / 60000));

  if (deltaMinutes < 1) return "just now";
  if (deltaMinutes < 60) return `${deltaMinutes}m ago`;

  const deltaHours = Math.round(deltaMinutes / 60);
  if (deltaHours < 24) return `${deltaHours}h ago`;

  const deltaDays = Math.round(deltaHours / 24);
  return `${deltaDays}d ago`;
}

function formatShortId(value?: string | null) {
  if (!value) return null;
  if (value.length <= 12) return value;
  return `${value.slice(0, 8)}...${value.slice(-4)}`;
}

function getCategoryLabel(category: AuditLogEntry["category"]) {
  switch (category) {
    case "audit":
      return "Manager action";
    case "sync":
      return "Sync";
    case "auth":
      return "Auth";
    default:
      return "Error";
  }
}

function formatDateTime(timestamp: number) {
  try {
    return new Date(timestamp).toLocaleString();
  } catch {
    return "Unknown time";
  }
}

function formatActionLabel(action: string) {
  return action
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function getStatusColors(status: AuditLogEntry["status"]) {
  if (status === "error") {
    return {
      backgroundColor: theme.colors.errorBg,
      borderColor: theme.colors.errorBorder,
      color: theme.colors.error,
    };
  }

  if (status === "success") {
    return {
      backgroundColor: theme.colors.successBg,
      borderColor: theme.colors.success,
      color: theme.colors.success,
    };
  }

  return {
    backgroundColor: theme.colors.primaryMuted,
    borderColor: theme.colors.primary,
    color: theme.colors.primary,
  };
}

function getCategoryColors(category: AuditLogEntry["category"]) {
  if (category === "audit") {
    return {
      backgroundColor: theme.colors.surface3,
      borderColor: theme.colors.borderStrong,
      color: theme.colors.text,
    };
  }

  if (category === "sync") {
    return {
      backgroundColor: theme.colors.primaryMuted,
      borderColor: theme.colors.primary,
      color: theme.colors.primary,
    };
  }

  if (category === "auth") {
    return {
      backgroundColor: theme.colors.successBg,
      borderColor: theme.colors.success,
      color: theme.colors.success,
    };
  }

  return {
    backgroundColor: theme.colors.errorBg,
    borderColor: theme.colors.errorBorder,
    color: theme.colors.error,
  };
}

function renderMetadata(metadata: Record<string, unknown>) {
  const entries = Object.entries(metadata).slice(0, 6);

  if (!entries.length) {
    return null;
  }

  return entries
    .map(([key, value]) => `${key}: ${typeof value === "string" ? value : JSON.stringify(value)}`)
    .join("\n");
}

export default function AdminAuditScreen() {
  const { user, adminMode } = useAuth();
  const { role, loading: roleLoading } = useRole();
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isAllowed = role === "ADMIN" && adminMode;

  const load = useCallback(async () => {
    if (!user?.id || !isAllowed) {
      setEntries([]);
      setLoading(false);
      return;
    }

    try {
      setError(null);
      setLoading(true);
      const nextEntries = await listAuditLogEntries(120);
      setEntries(nextEntries);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load audit log.");
    } finally {
      setLoading(false);
    }
  }, [isAllowed, user?.id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const onClearData = useCallback(() => {
    if (!entries.length || clearing) {
      return;
    }

    Alert.alert(
      "Clear audit data",
      "This will delete audit log entries from Supabase for this admin view.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear",
          style: "destructive",
          onPress: async () => {
            try {
              setError(null);
              setClearing(true);
              const deletedCount = await clearAuditLogEntries();
              if (entries.length > 0 && deletedCount === 0) {
                throw new Error("No audit entries were deleted. Check the audit_log delete policy.");
              }
              setEntries([]);
              await load();
            } catch (e: any) {
              setError(e?.message ?? "Failed to clear audit log.");
            } finally {
              setClearing(false);
            }
          },
        },
      ]
    );
  }, [clearing, entries.length, load]);

  const summary = useMemo(() => {
    return entries.reduce(
      (acc, entry) => {
        acc.total += 1;
        if (entry.status === "error") acc.errors += 1;
        if (entry.category === "sync") acc.sync += 1;
        if (entry.category === "audit") acc.manager += 1;
        return acc;
      },
      { total: 0, errors: 0, sync: 0, manager: 0 }
    );
  }, [entries]);

  if (roleLoading || loading) {
    return (
      <View style={{ ...ui.screen, ...ui.centered }}>
        <ActivityIndicator />
        <Text style={{ marginTop: 8 }}>Loading audit log...</Text>
      </View>
    );
  }

  if (!isAllowed) {
    return (
      <View style={{ ...ui.screenPadded, gap: 16, justifyContent: "center" }}>
        <Text style={theme.typography.titleMd}>Admin audit log</Text>
        <View style={ui.mutedPanel}>
          <Text style={{ color: theme.colors.text, fontWeight: "700", marginBottom: 6 }}>
            Access restricted
          </Text>
          <Text style={{ color: theme.colors.muted }}>
            This screen is available only when you are an admin and Admin Mode is enabled.
          </Text>
        </View>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => ({
            opacity: pressed ? 0.8 : 1,
            ...ui.button,
          })}
        >
          <Text style={{ fontWeight: "700" }}>Back</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView
      style={ui.screen}
      contentContainerStyle={{ padding: 20, gap: 16 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Text style={theme.typography.titleMd}>Admin audit log</Text>
          <Text style={{ color: theme.colors.muted, marginTop: 4 }}>
            Recent manager actions and sync events from Supabase audit_log.
          </Text>
        </View>
        <View style={{ alignItems: "flex-end", gap: 8 }}>
          <Pressable
            onPress={() => router.back()}
            style={({ pressed }) => ({
              opacity: pressed ? 0.8 : 1,
              ...ui.button,
              paddingVertical: 10,
              paddingHorizontal: 14,
            })}
          >
            <Text style={{ fontWeight: "700" }}>Back</Text>
          </Pressable>

          <Pressable
            disabled={!entries.length || clearing}
            onPress={onClearData}
            style={({ pressed }) => ({
              opacity: pressed || clearing || !entries.length ? 0.55 : 1,
              ...ui.chip,
              backgroundColor: theme.colors.errorBg,
              borderColor: theme.colors.errorBorder,
              paddingVertical: 7,
              paddingHorizontal: 12,
            })}
          >
            <Text style={{ color: theme.colors.error, fontWeight: "700" }}>
              {clearing ? "Clearing..." : "Clear data"}
            </Text>
          </Pressable>
        </View>
      </View>

      <View style={{ ...ui.screenSection, gap: 10 }}>
        <Text style={{ color: theme.colors.text, fontWeight: "700" }}>
          Operational snapshot
        </Text>
        <Text style={{ color: theme.colors.muted }}>
          Pull to refresh. The screen shows up to 120 latest entries, and backend retention removes entries older than 7 days automatically.
        </Text>
      </View>

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
        {[
          { label: "Total entries", value: summary.total, tone: theme.colors.text },
          { label: "Errors", value: summary.errors, tone: theme.colors.error },
          { label: "Sync events", value: summary.sync, tone: theme.colors.primary },
          { label: "Manager actions", value: summary.manager, tone: theme.colors.success },
        ].map((item) => (
          <View key={item.label} style={{ ...ui.screenSection, flexGrow: 1, minWidth: 150, gap: 4, padding: 14 }}>
            <Text style={{ fontSize: 22, fontWeight: "700", color: item.tone }}>{item.value}</Text>
            <Text style={{ color: theme.colors.muted }}>{item.label}</Text>
          </View>
        ))}
      </View>

      {error ? (
        <View
          style={{
            ...ui.mutedPanel,
            backgroundColor: theme.colors.errorBg,
            borderColor: theme.colors.errorBorder,
          }}
        >
          <Text style={{ color: theme.colors.error, fontWeight: "700" }}>Load failed</Text>
          <Text style={{ color: theme.colors.error, marginTop: 4 }}>{error}</Text>
        </View>
      ) : null}

      {entries.length === 0 ? (
        <View style={{ ...ui.screenSection, gap: 6 }}>
          <Text style={{ color: theme.colors.text, fontWeight: "700" }}>
            No audit events yet
          </Text>
          <Text style={{ color: theme.colors.muted }}>
            Trigger a manager action or a sync, then pull to refresh. This view only keeps the last 7 days of activity.
          </Text>
        </View>
      ) : (
        entries.map((entry) => {
          const statusColors = getStatusColors(entry.status);
          const categoryColors = getCategoryColors(entry.category);
          const metadataPreview = renderMetadata(entry.metadata);
          const targetPreview = formatShortId(entry.targetId);
          const orgPreview = formatShortId(entry.organizationId);
          const actorPreview = formatShortId(entry.actorUserId);

          return (
            <View key={entry.id} style={{ ...ui.cardElevated, padding: 14, gap: 10 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={{ color: theme.colors.text, fontWeight: "700", fontSize: 16 }}>
                    {formatActionLabel(entry.action)}
                  </Text>
                  <Text style={{ color: theme.colors.muted }}>
                    {formatRelativeTime(entry.createdAt)} • {formatDateTime(entry.createdAt)}
                  </Text>
                </View>

                <View style={{ alignItems: "flex-end", gap: 8 }}>
                  <View
                    style={{
                      ...ui.chip,
                      backgroundColor: statusColors.backgroundColor,
                      borderColor: statusColors.borderColor,
                    }}
                  >
                    <Text style={{ color: statusColors.color, fontWeight: "700" }}>
                      {entry.status}
                    </Text>
                  </View>
                  <View
                    style={{
                      ...ui.chip,
                      backgroundColor: categoryColors.backgroundColor,
                      borderColor: categoryColors.borderColor,
                    }}
                  >
                    <Text style={{ color: categoryColors.color, fontWeight: "700" }}>
                      {getCategoryLabel(entry.category)}
                    </Text>
                  </View>
                </View>
              </View>

              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                <View style={ui.chip}>
                  <Text style={{ color: theme.colors.text, fontWeight: "600" }}>{entry.source}</Text>
                </View>
                {entry.targetType ? (
                  <View style={ui.chip}>
                    <Text style={{ color: theme.colors.text, fontWeight: "600" }}>{entry.targetType}</Text>
                  </View>
                ) : null}
              </View>

              <View style={{ gap: 4 }}>
                {targetPreview ? (
                  <Text style={{ color: theme.colors.text }}>
                    Target ID: {targetPreview}
                  </Text>
                ) : null}
                {orgPreview ? (
                  <Text style={{ color: theme.colors.muted }}>Org: {orgPreview}</Text>
                ) : null}
                {actorPreview ? (
                  <Text style={{ color: theme.colors.muted }}>Actor: {actorPreview}</Text>
                ) : null}
                {typeof entry.durationMs === "number" ? (
                  <Text style={{ color: theme.colors.muted }}>Duration: {entry.durationMs} ms</Text>
                ) : null}
                {entry.errorMessage ? (
                  <Text style={{ color: theme.colors.error }}>Error: {entry.errorMessage}</Text>
                ) : null}
                {metadataPreview ? (
                  <View style={ui.mutedPanel}>
                    <Text style={{ color: theme.colors.text, fontWeight: "700", marginBottom: 4 }}>
                      Metadata
                    </Text>
                    <Text style={{ color: theme.colors.muted }}>{metadataPreview}</Text>
                  </View>
                ) : null}
              </View>
            </View>
          );
        })
      )}
    </ScrollView>
  );
}
