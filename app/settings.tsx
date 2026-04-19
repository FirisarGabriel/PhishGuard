import { useEffect, useState, useCallback } from "react";
import { View, Text, Switch, Alert, Pressable, ActivityIndicator } from "react-native";
import { router } from "expo-router";

import { getBiometricEnabled, setBiometricEnabled } from "../src/secure";
import { resetAllProgress } from "../src/repos/lessons";
import { signOut } from "../src/auth/service";
import { useAuth } from "../src/auth/AuthProvider";
import { useRole } from "../src/auth/useRole";

export default function Settings() {
  const [enabled, setEnabled] = useState<boolean>(false);
  const [loading, setLoading] = useState(true);
  const [resetting, setResetting] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const { user, adminMode, setAdminMode } = useAuth();
  const userId = user?.id ?? null;

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
      "This will clear all local lesson progress on this device.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Reset",
          style: "destructive",
          onPress: async () => {
            try {
              setResetting(true);
              await resetAllProgress(userId);
              Alert.alert("Done", "All lesson progress cleared.");
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
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator />
        <Text style={{ marginTop: 8 }}>Loading…</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, padding: 24, backgroundColor: "white" }}>
      <Text style={{ fontSize: 22, fontWeight: "700", marginBottom: 12 }}>
        Settings
      </Text>

      {/* Biometrics */}
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 12 }}>
        <Text style={{ fontSize: 16 }}>Use biometric login</Text>
        <Switch value={enabled} onValueChange={onToggleBiometrics} />
      </View>
      <Text style={{ color: "#6b7280" }}>
        You can also enable this after your first login.
      </Text>

      {/* Admin Mode (doar admin) */}
      {isAdmin && (
        <>
          <View style={{ height: 1, backgroundColor: "#e5e7eb", marginVertical: 20 }} />

          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 12 }}>
            <Text style={{ fontSize: 16 }}>Admin Mode</Text>
            <Switch value={adminMode} onValueChange={onToggleAdminMode} />
          </View>
          <Text style={{ color: "#6b7280" }}>
            When enabled, you will see editing controls for lessons and quizzes.
          </Text>
        </>
      )}

      <View style={{ height: 1, backgroundColor: "#e5e7eb", marginVertical: 20 }} />

      <View>
        <Text style={{ fontSize: 16, fontWeight: "600", marginBottom: 8 }}>
          Data
        </Text>
        <Pressable
          onPress={onResetPress}
          disabled={resetting}
          style={({ pressed }) => ({
            opacity: resetting || pressed ? 0.8 : 1,
            borderWidth: 1,
            borderColor: "#e5e7eb",
            borderRadius: 12,
            padding: 14,
            alignItems: "center",
            backgroundColor: "white",
          })}
          accessibilityLabel="Reset all lesson progress"
        >
          {resetting ? <ActivityIndicator /> : <Text style={{ fontWeight: "600" }}>Reset lesson progress</Text>}
        </Pressable>
        <Text style={{ color: "#6b7280", marginTop: 8 }}>
          Clears the local completion status for all lessons.
        </Text>
      </View>

      <View style={{ height: 1, backgroundColor: "#e5e7eb", marginVertical: 20 }} />

      <View style={{ marginBottom: 24 }}>
        <Text style={{ fontSize: 16, fontWeight: "600", marginBottom: 8 }}>
          Account
        </Text>

        <Pressable
          onPress={onLogoutPress}
          disabled={loggingOut}
          style={({ pressed }) => ({
            opacity: loggingOut || pressed ? 0.8 : 1,
            borderWidth: 1,
            borderColor: "#e5e7eb",
            borderRadius: 12,
            padding: 14,
            alignItems: "center",
            backgroundColor: "white",
            marginBottom: 8,
          })}
          accessibilityLabel="Log out"
        >
          {loggingOut ? <ActivityIndicator /> : <Text style={{ fontWeight: "600" }}>Log out</Text>}
        </Pressable>

        <Text style={{ color: "#6b7280" }}>
          Logs you out on this device. Your progress stays saved locally.
        </Text>
      </View>

    </View>
  );
}
