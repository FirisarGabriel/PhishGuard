import { useEffect, useState } from "react";
import { View, Text, Pressable, ActivityIndicator } from "react-native";
import { router } from "expo-router";
import {
  setBiometricEnabled,
  setHasSeenBiometricPrompt,
  getBiometricEnabled,
  getHasSeenBiometricPrompt,
} from "../../src/secure";
import { useAuth } from "../../src/auth/AuthProvider";
import { getCurrentUser } from "../../src/auth/service";
import { theme } from "../../src/theme";
import { ui } from "../../src/ui";

export default function BiometricEnable() {
  const { user } = useAuth();

  const [userId, setUserId] = useState<string | null>(user?.id ?? null);
  const [resolving, setResolving] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Asigurăm userId chiar dacă contextul încă nu e ready
  useEffect(() => {
    (async () => {
      setErr(null);

      if (user?.id) {
        setUserId(user.id);
        return;
      }

      setResolving(true);
      try {
        const u = await getCurrentUser();
        setUserId(u?.id ?? null);
      } catch (e: any) {
        setErr(e?.message ?? "Failed to resolve user.");
        setUserId(null);
      } finally {
        setResolving(false);
      }
    })();
  }, [user?.id]);

  const persist = async (enable: boolean) => {
    if (!userId) return;

    setSaving(true);
    setErr(null);

    try {
      // scriem scoped per user
      await setHasSeenBiometricPrompt(true, userId);
      await setBiometricEnabled(enable, userId);

      // verificăm imediat că s-a salvat corect
      const seenCheck = await getHasSeenBiometricPrompt(userId);
      const enabledCheck = await getBiometricEnabled(userId);

      if (!seenCheck) {
        setErr("Could not persist hasSeenBiometricPrompt. (SecureStore write failed)");
        return;
      }
      if (enabledCheck !== enable) {
        setErr("Could not persist biometricEnabled. (SecureStore write failed)");
        return;
      }

      router.replace("/home");
    } catch (e: any) {
      setErr(e?.message ?? "Failed to save biometric preference.");
    } finally {
      setSaving(false);
    }
  };

  const disabled = resolving || saving || !userId;

  return (
    <View style={{ ...ui.screenPadded, justifyContent: "center", gap: 16 }}>
      <Text style={theme.typography.titleMd}>
        Enable biometric login?
      </Text>
      <Text style={{ opacity: 0.7, color: theme.colors.muted }}>
        Use fingerprint to sign in faster next time. You can change this later in Settings.
      </Text>

      {/* mic debug helper, ca să vezi dacă userId chiar există */}
      <Text style={{ fontSize: 12, opacity: 0.6, color: theme.colors.muted }}>
        userId: {userId ?? "(resolving...)"}{" "}
      </Text>

      {err ? <Text style={{ color: theme.colors.error }}>{err}</Text> : null}

      {disabled ? (
        <View style={{ alignItems: "center", gap: 8 }}>
          <ActivityIndicator />
          <Text style={{ opacity: 0.7, color: theme.colors.muted }}>Preparing secure settings…</Text>
        </View>
      ) : null}

      <Pressable
        onPress={() => persist(true)}
        disabled={disabled}
        accessibilityLabel="Enable biometrics"
        style={{
          ...ui.button,
          opacity: disabled ? 0.5 : 1,
        }}
      >
        <Text>Enable</Text>
      </Pressable>

      <Pressable
        onPress={() => persist(false)}
        disabled={disabled}
        accessibilityLabel="Not now"
        style={{
          ...ui.button,
          opacity: disabled ? 0.5 : 0.8,
        }}
      >
        <Text>Not now</Text>
      </Pressable>
    </View>
  );
}
