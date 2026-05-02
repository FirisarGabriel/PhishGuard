import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";

import { ErrorBanner } from "../src/Feedback";
import { useAuth } from "../src/auth/AuthProvider";
import {
  acceptOrganizationInvite,
  dismissInboxNotification,
  listMyInboxNotifications,
  listMyPendingOrganizationInvites,
  type InboxNotification,
  type PendingOrganizationInvite,
} from "../src/repos/b2b";
import { runHybridSync } from "../src/sync/hybrid";
import { theme } from "../src/theme";
import { ui } from "../src/ui";

function formatInviteRole(role: PendingOrganizationInvite["role"]) {
  switch (role) {
    case "org_owner":
      return "Owner";
    case "org_manager":
      return "Manager";
    case "employee":
    default:
      return "Employee";
  }
}

function formatExpiry(value?: number | null) {
  if (!value) return "No expiry";

  try {
    return new Intl.DateTimeFormat("en", {
      month: "short",
      day: "numeric",
    }).format(new Date(value));
  } catch {
    return "No expiry";
  }
}

function goBackOrHome() {
  if (router.canGoBack()) {
    router.back();
    return;
  }

  router.replace("/home");
}

export default function OrganizationInvitesScreen() {
  const { user, refreshAuthState } = useAuth();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [acceptingToken, setAcceptingToken] = useState<string | null>(null);
  const [dismissingNotificationId, setDismissingNotificationId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [invites, setInvites] = useState<PendingOrganizationInvite[]>([]);
  const [notifications, setNotifications] = useState<InboxNotification[]>([]);

  const load = useCallback(async () => {
    if (!user?.id) {
      setInvites([]);
      setError("You must be signed in to view invites.");
      setLoading(false);
      return;
    }

    try {
      setError(null);
      setLoading(true);
      const [nextInvites, nextNotifications] = await Promise.all([
        listMyPendingOrganizationInvites(),
        listMyInboxNotifications(),
      ]);
      setInvites(nextInvites);
      setNotifications(nextNotifications);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load organization invites.");
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    void load();
  }, [load]);

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

  const hasInvites = useMemo(() => invites.length > 0, [invites]);
  const hasNotifications = useMemo(() => notifications.length > 0, [notifications]);

  const onDismissNotification = useCallback(async (notificationId: string) => {
    try {
      setError(null);
      setDismissingNotificationId(notificationId);
      await dismissInboxNotification(notificationId);
      setNotifications((current) => current.filter((entry) => entry.id !== notificationId));
    } catch (e: any) {
      setError(e?.message ?? "Failed to dismiss notification.");
    } finally {
      setDismissingNotificationId((current) => (current === notificationId ? null : current));
    }
  }, []);

  const onAccept = useCallback(
    async (token: string) => {
      try {
        setError(null);
        setAcceptingToken(token);
        await acceptOrganizationInvite({ token });

        if (user?.id) {
          await runHybridSync(user.id, { trigger: "invite_accept_refresh" });
        }

        await refreshAuthState();
        router.replace("/home");
      } catch (e: any) {
        const message = e?.message ?? "Failed to accept invite.";

        if (message.includes("Invite is no longer available")) {
          try {
            if (user?.id) {
              await runHybridSync(user.id, { trigger: "invite_recovery_refresh" });
            }
            await refreshAuthState();
            await load();
            router.replace("/home");
            return;
          } catch {
            // Fall through to the visible error if the invite truly is unavailable.
          }
        }

        setError(message);
      } finally {
        setAcceptingToken((current) => (current === token ? null : current));
      }
    },
    [load, refreshAuthState, user?.id]
  );

  if (loading) {
    return (
      <View style={{ ...ui.screen, ...ui.centered }}>
        <ActivityIndicator />
        <Text style={{ marginTop: 8, color: theme.colors.muted }}>
          Loading invites...
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={ui.screen}
      contentContainerStyle={{ padding: 20, gap: 16 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={theme.typography.titleLg}>Inbox</Text>
          <Text style={{ color: theme.colors.muted }}>
            Review invites and assignment completion notifications for {user?.email ?? "your account"}.
          </Text>
        </View>

        <Pressable
          onPress={goBackOrHome}
          style={({ pressed }) => ({
            ...ui.button,
            opacity: pressed ? 0.8 : 1,
            paddingVertical: 10,
            paddingHorizontal: 12,
          })}
        >
          <Ionicons name="arrow-back" size={18} />
        </Pressable>
      </View>

      {error && <ErrorBanner message={error} />}

      <View style={ui.screenSection}>
        <Text style={theme.typography.sectionTitle}>Notifications</Text>
        <Text style={{ color: theme.colors.muted, marginTop: 6 }}>
          Assignment completion updates sent to your inbox.
        </Text>

        <View style={{ gap: 12, marginTop: 14 }}>
          {hasNotifications ? (
            notifications.map((notification) => (
              <View
                key={notification.id}
                style={{
                  ...ui.cardElevated,
                  padding: 14,
                  gap: 8,
                  borderColor: theme.colors.primary,
                }}
              >
                <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
                  <View
                    style={{
                      ...ui.chip,
                      backgroundColor: theme.colors.primaryMuted,
                      borderColor: theme.colors.primary,
                    }}
                  >
                    <Text style={{ color: theme.colors.primary, fontWeight: "700" }}>Update</Text>
                  </View>

                  <View style={{ flex: 1, gap: 4 }}>
                    <Text style={{ fontSize: 16, fontWeight: "700", color: theme.colors.text }}>
                      {notification.title}
                    </Text>
                    {notification.body ? (
                      <Text style={{ color: theme.colors.muted }}>{notification.body}</Text>
                    ) : null}
                    <Text style={{ color: theme.colors.muted, fontSize: 12 }}>
                      {new Date(notification.createdAt).toLocaleString()}
                    </Text>
                  </View>
                </View>

                <Pressable
                  onPress={() => void onDismissNotification(notification.id)}
                  disabled={dismissingNotificationId === notification.id}
                  style={({ pressed }) => ({
                    ...ui.button,
                    opacity: dismissingNotificationId === notification.id ? 0.6 : pressed ? 0.85 : 1,
                    alignSelf: "flex-end",
                    paddingVertical: 10,
                    paddingHorizontal: 12,
                  })}
                >
                  {dismissingNotificationId === notification.id ? (
                    <ActivityIndicator />
                  ) : (
                    <Text style={{ fontWeight: "700", color: theme.colors.text }}>Dismiss</Text>
                  )}
                </Pressable>
              </View>
            ))
          ) : (
            <View style={ui.mutedPanel}>
              <Text style={{ color: theme.colors.muted }}>
                No notifications yet.
              </Text>
            </View>
          )}
        </View>
      </View>

      <View style={ui.screenSection}>
        <Text style={theme.typography.sectionTitle}>Pending invites</Text>
        <Text style={{ color: theme.colors.muted, marginTop: 6 }}>
          Accept organization invites sent to this account.
        </Text>

        <View style={{ gap: 12, marginTop: 14 }}>
          {hasInvites ? (
            invites.map((invite) => {
              const accepting = acceptingToken === invite.token;
              return (
                <View
                  key={invite.id}
                  style={{
                    ...ui.cardElevated,
                    padding: 14,
                    gap: 12,
                  }}
                >
                  <View style={{ gap: 4 }}>
                    <Text style={{ fontSize: 17, fontWeight: "700", color: theme.colors.text }}>
                      {invite.organizationName}
                    </Text>
                    <Text style={{ color: theme.colors.muted }}>
                      Role: {formatInviteRole(invite.role)}
                    </Text>
                    <Text style={{ color: theme.colors.muted }}>
                      Expires {formatExpiry(invite.expiresAt)}
                    </Text>
                  </View>

                  <Pressable
                    onPress={() => void onAccept(invite.token)}
                    disabled={accepting}
                    style={({ pressed }) => ({
                      ...ui.buttonPrimary,
                      opacity: accepting ? 0.6 : pressed ? 0.85 : 1,
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: 8,
                    })}
                  >
                    {accepting ? (
                      <ActivityIndicator color={theme.colors.textInverse} />
                    ) : (
                      <>
                        <Ionicons name="checkmark-circle-outline" size={18} color={theme.colors.textInverse} />
                        <Text style={{ color: theme.colors.textInverse, fontWeight: "700" }}>
                          Accept invite
                        </Text>
                      </>
                    )}
                  </Pressable>
                </View>
              );
            })
          ) : (
            <View style={ui.mutedPanel}>
              <Text style={{ color: theme.colors.muted }}>
                No pending invites.
              </Text>
            </View>
          )}
        </View>
      </View>
    </ScrollView>
  );
}