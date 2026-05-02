import { useEffect, useState, useCallback } from "react";
import { View, Text, Switch, Alert, Pressable, ActivityIndicator, ScrollView } from "react-native";
import { router } from "expo-router";

import { getBiometricEnabled, setBiometricEnabled } from "../src/secure";
import { setAchievementsSeenAt } from "../src/secure";
import { resetAllProgress } from "../src/repos/lessons";
import { resetAllAchievements } from "../src/repos/achievements";
import { signOut } from "../src/auth/service";
import { useAuth } from "../src/auth/AuthProvider";
import { useRole } from "../src/auth/useRole";
import { theme } from "../src/theme";
import { ui } from "../src/ui";

function StatusChip({ label }: { label: string }) {
  return (
    <View style={ui.chip}>
      <Text style={{ color: theme.colors.text, fontWeight: "700" }}>{label}</Text>
    </View>
  );
}

export default function Settings() {
  const [enabled, setEnabled] = useState<boolean>(false);
  const [loading, setLoading] = useState(true);
  const [resetting, setResetting] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const { user, adminMode, setAdminMode } = useAuth();
  const userId = user?.id ?? null;
  const displayName =
    typeof user?.user_metadata?.name === "string" && user.user_metadata.name.trim()
      ? user.user_metadata.name.trim()
      : typeof user?.user_metadata?.full_name === "string" && user.user_metadata.full_name.trim()
        ? user.user_metadata.full_name.trim()
        : "Unknown user";
  const displayEmail = user?.email?.trim() || "No email";

  const { role, loading: roleLoading } = useRole();
  const isAdmin = role === "ADMIN";

  // Redirect dacă nu există user (edge-case)
  useEffect(() => {
    if (!userId) router.replace("/login");
  }, [userId]);

  // Load biometric toggle (adminMode vine din context)
  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        if (!userId) {
          if (alive) {
            setEnabled(false);
            setLoading(false);
          }
          return;
        }

        setLoading(true);
        const v = await getBiometricEnabled(userId);
        if (alive) setEnabled(!!v);
      } catch {
        if (alive) setEnabled(false);
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [userId]);

  const onToggleBiometrics = useCallback(
    async (value: boolean) => {
      if (!userId) return;

      try {
        setEnabled(value);
        await setBiometricEnabled(value, userId);

        Alert.alert(
          "Biometrics",
          value
            ? "Biometric login enabled. Next time you'll be asked for fingerprint."
            : "Biometric login disabled. Next time you'll use password to sign in."
        );
      } catch (e: any) {
        setEnabled((prev) => !prev);
        Alert.alert("Error", e?.message ?? "Failed to update biometric setting.");
      }
    },
    [userId]
  );

  const onToggleAdminMode = useCallback(
    async (value: boolean) => {
      if (!userId) return;

      try {
        // folosește funcția din context (persistă și actualizează instant)
        await setAdminMode(value);
      } catch (e: any) {
        Alert.alert("Error", e?.message ?? "Failed to update admin mode.");
      }
    },
    [userId, setAdminMode]
  );

  const onResetPress = useCallback(() => {
    if (!userId) return;

    Alert.alert(
      "Reset lesson progress",
      "This will clear all local training progress on this device, including block checkpoints.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Reset",
          style: "destructive",
          onPress: async () => {
            try {
              setResetting(true);
              await resetAllProgress(userId);
              Alert.alert("Done", "All training progress cleared.");
            } catch (e: any) {
              Alert.alert("Error", e?.message ?? "Failed to reset progress.");
            } finally {
              setResetting(false);
            }
          },
        },
      ]
    );
  }, [userId]);

  const onResetAchievementsPress = useCallback(() => {
    if (!userId) return;

    Alert.alert(
      "Reset achievements",
      "This will clear all unlocked achievements on this device for testing.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Reset",
          style: "destructive",
          onPress: async () => {
            try {
              await resetAllAchievements(userId);
              await setAchievementsSeenAt(0, userId);
              Alert.alert("Done", "All achievements were reset.");
            } catch (e: any) {
              Alert.alert("Error", e?.message ?? "Failed to reset achievements.");
            }
          },
        },
      ]
    );
  }, [userId]);

  const onLogoutPress = useCallback(() => {
    Alert.alert("Log out", "You will need to sign in again next time.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Log out",
        style: "destructive",
        onPress: async () => {
          if (loggingOut) return;
          try {
            setLoggingOut(true);
            await signOut();
            router.replace("/login");
          } catch (e: any) {
            Alert.alert("Error", e?.message ?? "Failed to log out.");
          } finally {
            setLoggingOut(false);
          }
        },
      },
    ]);
  }, [loggingOut]);

  if (loading || roleLoading || !userId) {
    return (
      <View style={{ ...ui.screen, ...ui.centered }}>
        <ActivityIndicator />
        <Text style={{ marginTop: 8 }}>Loading…</Text>
      </View>
    );
  }

  return (
    <ScrollView style={ui.screen} contentContainerStyle={{ padding: 24, gap: 16 }}>
      <View style={{ ...ui.screenSection, gap: 12 }}>
        <View style={{ gap: 2 }}>
          <Text style={theme.typography.titleMd}>
            Settings
          </Text>
          <Text style={{ color: theme.colors.muted }}>
            Device preferences, admin tools, and local test helpers.
          </Text>
        </View>

        <View>
          <Text style={{ fontSize: 18, fontWeight: "700", color: theme.colors.text }}>
            {displayName}
          </Text>
          <Text style={{ color: theme.colors.muted }}>
            {displayEmail}
          </Text>
        </View>

        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          <StatusChip label={isAdmin ? "Platform admin" : "Standard user"} />
          {isAdmin ? <StatusChip label={adminMode ? "Admin Mode on" : "Admin Mode off"} /> : null}
          {enabled ? <StatusChip label="Biometrics on" /> : <StatusChip label="Biometrics off" />}
        </View>
      </View>

      <View style={{ ...ui.screenSection, gap: 12 }}>
        <Text style={{ fontSize: 16, fontWeight: "600", color: theme.colors.text }}>
          Biometrics
        </Text>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 4 }}>
          <View style={{ flex: 1, paddingRight: 16 }}>
            <Text style={{ fontSize: 16, color: theme.colors.text }}>Use biometric login</Text>
            <Text style={{ color: theme.colors.muted, marginTop: 4 }}>
              You can also enable this after your first login.
            </Text>
          </View>
          <Switch value={enabled} onValueChange={onToggleBiometrics} />
        </View>
      </View>

      {isAdmin && (
        <View style={{ ...ui.screenSection, gap: 12 }}>
          <Text style={{ fontSize: 16, fontWeight: "600", color: theme.colors.text }}>
            Admin tools
          </Text>

          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 4 }}>
            <View style={{ flex: 1, paddingRight: 16 }}>
              <Text style={{ fontSize: 16, color: theme.colors.text }}>Admin Mode</Text>
              <Text style={{ color: theme.colors.muted, marginTop: 4 }}>
                Enables lesson editing controls and admin-only operational screens.
              </Text>
            </View>
            <Switch value={adminMode} onValueChange={onToggleAdminMode} />
          </View>

          {adminMode ? (
            <>
              <Pressable
                onPress={() => router.push("/admin-audit")}
                style={({ pressed }) => ({
                  opacity: pressed ? 0.8 : 1,
                  ...ui.button,
                })}
                accessibilityLabel="Open admin audit log"
              >
                <Text style={{ fontWeight: "700", color: theme.colors.text }}>
                  Open admin audit log
                </Text>
              </Pressable>
              <View style={ui.mutedPanel}>
                <Text style={{ color: theme.colors.text, fontWeight: "700", marginBottom: 4 }}>
                  Audit retention
                </Text>
                <Text style={{ color: theme.colors.muted }}>
                  Audit entries older than 7 days are cleaned up automatically on the backend.
                </Text>
              </View>
            </>
          ) : (
            <View style={ui.mutedPanel}>
              <Text style={{ color: theme.colors.text, fontWeight: "700", marginBottom: 4 }}>
                Admin tools are hidden
              </Text>
              <Text style={{ color: theme.colors.muted }}>
                Turn on Admin Mode when you need audit visibility or editing controls.
              </Text>
            </View>
          )}
        </View>
      )}

      <View style={{ ...ui.screenSection, gap: 12 }}>
        <Text style={{ fontSize: 16, fontWeight: "600", color: theme.colors.text }}>
          Data
        </Text>
        <Pressable
          onPress={onResetPress}
          disabled={resetting}
          style={({ pressed }) => ({
            opacity: resetting || pressed ? 0.8 : 1,
            ...ui.button,
          })}
          accessibilityLabel="Reset all lesson progress"
        >
          {resetting ? <ActivityIndicator /> : <Text style={{ fontWeight: "600" }}>Reset lesson progress</Text>}
        </Pressable>
        <Text style={{ color: theme.colors.muted, marginTop: 8 }}>
          Clears the local completion status for all lessons.
        </Text>

        {__DEV__ && (
          <>
            <Pressable
              onPress={onResetAchievementsPress}
              style={({ pressed }) => ({
                opacity: pressed ? 0.8 : 1,
                ...ui.button,
                marginTop: 12,
              })}
              accessibilityLabel="Reset unlocked achievements"
            >
              <Text style={{ fontWeight: "600" }}>Reset achievements (dev)</Text>
            </Pressable>
            <Text style={{ color: theme.colors.muted, marginTop: 8 }}>
              Dev-only helper for retesting achievement unlock flows.
            </Text>
          </>
        )}
      </View>

      <View style={{ ...ui.screenSection, gap: 12, marginBottom: 24 }}>
        <Text style={{ fontSize: 16, fontWeight: "600", marginBottom: 8 }}>
          Account
        </Text>

        <Pressable
          onPress={onLogoutPress}
          disabled={loggingOut}
          style={({ pressed }) => ({
            opacity: loggingOut || pressed ? 0.8 : 1,
            ...ui.button,
            marginBottom: 8,
          })}
          accessibilityLabel="Log out"
        >
          {loggingOut ? <ActivityIndicator /> : <Text style={{ fontWeight: "600" }}>Log out</Text>}
        </Pressable>

        <Text style={{ color: theme.colors.muted }}>
          Logs you out on this device. Your progress stays saved locally.
        </Text>
      </View>

    </ScrollView>
  );
}
