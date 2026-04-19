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
    <View style={{ flex: 1, padding: 24, justifyContent: "center", gap: 12 }}>
      <Text style={{ fontSize: 24, fontWeight: "700" }}>Create account</Text>

      <TextInput
        value={name}
        onChangeText={setName}
        placeholder="Full name"
        placeholderTextColor="#6b7280"
        autoCapitalize="words"
        style={{ borderWidth: 1, borderRadius: 12, padding: 12 }}
      />

      <TextInput
        value={email}
        onChangeText={setEmail}
        placeholder="email@example.com"
        placeholderTextColor="#6b7280"
        autoCapitalize="none"
        keyboardType="email-address"
        textContentType="emailAddress"
        style={{ borderWidth: 1, borderRadius: 12, padding: 12 }}
      />
      {!isEmailValid && email.length > 0 && (
        <Text style={{ fontSize: 12, color: "red" }}>Invalid email format</Text>
      )}

      <TextInput
        value={pass}
        onChangeText={setPass}
        placeholder="password"
        placeholderTextColor="#6b7280"
        secureTextEntry
        textContentType="newPassword"
        style={{ borderWidth: 1, borderRadius: 12, padding: 12 }}
      />
      {!isStrong && pass.length > 0 && (
        <Text style={{ fontSize: 12, color: "orange" }}>
          Use at least 6 characters
        </Text>
      )}

      {err ? <Text style={{ fontSize: 13, color: "red" }}>{err}</Text> : null}

      <Pressable
        onPress={onSignup}
        disabled={!canSubmit}
        style={{
          padding: 14,
          borderRadius: 12,
          alignItems: "center",
          opacity: canSubmit ? 1 : 0.6,
          borderWidth: 1,
          backgroundColor: "white",
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
