import { useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ActivityIndicator,
} from "react-native";
import { Link, router } from "expo-router";

import { signUp } from "../../src/auth/service";
import {
  setLastLoginEmail,
  setBiometricEnabled,
  setHasSeenBiometricPrompt,
} from "../../src/secure";
import { theme } from "../../src/theme";
import { ui } from "../../src/ui";

export default function Signup() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const isEmailValid = /\S+@\S+\.\S+/.test(email);
  const isStrong = pass.length >= 6;
  const canSubmit =
    name.trim().length > 1 && isEmailValid && isStrong && !loading;

  const onSignup = async () => {
    if (!canSubmit) return;
    try {
      setErr(null);
      setLoading(true);

      const trimmedEmail = email.trim();

      // service.ts returnează { user, session, error }
      const { user, error } = await signUp(trimmedEmail, pass, {
        name: name.trim(),
      });

      if (error) {
        setErr(error.message ?? "Sign-up failed.");
        return;
      }

      await setLastLoginEmail(trimmedEmail);

      const userId = user?.id ?? null;
      if (!userId) {
        // fallback: dacă nu avem userId (caz rar), mergem în home
        // AuthProvider va gestiona restul flow-ului.
        router.replace("/home");
        return;
      }

      // Inițializare pentru cont nou:
      // - prompt nevăzut
      // - biometrie dezactivată până userul alege explicit “Enable”
      await setHasSeenBiometricPrompt(false, userId);
      await setBiometricEnabled(false, userId);

      // Fix cerința: prima dată după signup → prompt biometrie
      router.replace("/biometric-enable");
    } catch (e: any) {
      setErr(e?.message ?? "Unexpected error.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={{ ...ui.screenPadded, justifyContent: "center", gap: 12 }}>
      <Text style={theme.typography.titleLg}>Create account</Text>

      <TextInput
        value={name}
        onChangeText={setName}
        placeholder="Full name"
        placeholderTextColor={theme.colors.muted}
        autoCapitalize="words"
        style={ui.input}
      />

      <TextInput
        value={email}
        onChangeText={setEmail}
        placeholder="email@example.com"
        placeholderTextColor={theme.colors.muted}
        autoCapitalize="none"
        keyboardType="email-address"
        textContentType="emailAddress"
        style={ui.input}
      />
      {!isEmailValid && email.length > 0 && (
        <Text style={{ fontSize: 12, color: theme.colors.error }}>Invalid email format</Text>
      )}

      <TextInput
        value={pass}
        onChangeText={setPass}
        placeholder="password"
        placeholderTextColor={theme.colors.muted}
        secureTextEntry
        textContentType="newPassword"
        style={ui.input}
      />
      {!isStrong && pass.length > 0 && (
        <Text style={{ fontSize: 12, color: theme.colors.warning }}>
          Use at least 6 characters
        </Text>
      )}

      {err ? <Text style={{ fontSize: 13, color: theme.colors.error }}>{err}</Text> : null}

      <Pressable
        onPress={onSignup}
        disabled={!canSubmit}
        style={{
          ...ui.button,
          opacity: canSubmit ? 1 : 0.6,
        }}
        accessibilityLabel="Create account with email and password"
      >
        {loading ? <ActivityIndicator /> : <Text>Sign up</Text>}
      </Pressable>

      <View
        style={{
          flexDirection: "row",
          justifyContent: "center",
          marginTop: 8,
        }}
      >
        <Text>Already have an account? </Text>
        <Link href="/login">
          <Text style={{ fontWeight: "600" }}>Sign in</Text>
        </Link>
      </View>
    </View>
  );
}
