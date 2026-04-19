import { useCallback, useEffect, useState } from "react";
import { View, Text, Pressable, ActivityIndicator, Platform } from "react-native";
import * as LocalAuthentication from "expo-local-authentication";
import { router } from "expo-router";

import { signOut } from "../../src/auth/service";
import { useAuth } from "../../src/auth/AuthProvider";
import { getBiometricEnabled, getHasSeenBiometricPrompt } from "../../src/secure";

export default function BiometricLogin() {
  const { user, biometricLocked, unlockBiometric } = useAuth();

  const [checking, setChecking] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const usePasswordInstead = useCallback(async () => {
    try {
      await signOut(); // aici e explicit, deci e OK
    } catch {}
    router.replace("/login");
  }, []);

  const doAuth = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: "Authenticate",
        cancelLabel: "Cancel",
        disableDeviceFallback: true,
      });

      if (result.success) {
        unlockBiometric();
        router.replace("/home");
        return;
      }

      //  NU mai delogăm automat. Rămânem aici.
      setError("Authentication cancelled or failed. Try again or use password.");
    } catch (e: any) {
      setError(e?.message ?? "Authentication error.");
    } finally {
      setLoading(false);
    }
  }, [unlockBiometric]);

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setChecking(true);
        setError(null);

        if (!user?.id) {
          setChecking(false);
          router.replace("/login");
          return;
        }

        if (Platform.OS !== "android") {
          setChecking(false);
          router.replace("/login");
          return;
        }

        if (!biometricLocked) {
          setChecking(false);
          router.replace("/home");
          return;
        }

        const seen = await getHasSeenBiometricPrompt(user.id);
        const enabled = await getBiometricEnabled(user.id);

        if (!seen || !enabled) {
          setChecking(false);
          router.replace("/login");
          return;
        }

        const hasHardware = await LocalAuthentication.hasHardwareAsync();
        const isEnrolled = await LocalAuthentication.isEnrolledAsync();

        if (!hasHardware || !isEnrolled) {
          setChecking(false);
          router.replace("/login");
          return;
        }

        if (!alive) return;
        setChecking(false);

        // pornește promptul imediat
        await doAuth();
      } catch (e: any) {
        if (!alive) return;
        setError(e?.message ?? "Biometric check failed.");
        setChecking(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [user?.id, biometricLocked, doAuth]);

  if (checking) {
    return (
      <View style={{ flex: 1, padding: 24, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator />
        <Text style={{ marginTop: 10 }}>Checking device biometrics…</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, padding: 24, justifyContent: "center", gap: 16 }}>
      <Text style={{ fontSize: 22, fontWeight: "700" }}>Biometric login</Text>
      <Text style={{ opacity: 0.7 }}>Authenticate with your device biometrics (Android).</Text>

      {error ? <Text style={{ color: "red" }}>{String(error)}</Text> : null}

      <Pressable
        onPress={doAuth}
        disabled={loading}
        style={{
          padding: 14,
          borderWidth: 1,
          borderRadius: 12,
          alignItems: "center",
          opacity: loading ? 0.7 : 1,
        }}
      >
        {loading ? <ActivityIndicator /> : <Text>Try fingerprint again</Text>}
      </Pressable>

      <Pressable
        onPress={usePasswordInstead}
        style={{
          padding: 14,
          borderWidth: 1,
          borderRadius: 12,
          alignItems: "center",
          opacity: 0.8,
        }}
      >
        <Text>Use password instead</Text>
      </Pressable>
    </View>
  );
}
