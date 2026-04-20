import { useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ActivityIndicator,
  Alert,
} from "react-native";
import { Link, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import ProviderButton from "../../src/ProviderButton";
import { ErrorBanner, LoadingOverlay } from "../../src/Feedback";
import { theme } from "../../src/theme";
import { ui } from "../../src/ui";

import { signIn } from "../../src/auth/service";
import { signInWithGoogle, signInWithApple, signInAnonymously } from "../../src/auth/service";
import { getLastLoginEmail, setLastLoginEmail } from "../../src/secure";

import * as Linking from "expo-linking";

export default function Login() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [show, setShow] = useState(false);

  // IMPORTANT: folosim redirect fix (deep link) — asta trebuie să fie în Supabase Redirect URLs
  const redirectTo = "phishguard://auth-callback";

  // precompletăm email-ul dacă avem ceva salvat
  useEffect(() => {
    (async () => {
      const last = await getLastLoginEmail();
      if (last) setEmail(last.trim());
    })();
  }, []);

  const trimmedEmail = email.trim();
  const isEmailValid = /\S+@\S+\.\S+/.test(trimmedEmail);
  const canSubmit = isEmailValid && pass.length >= 6 && !loading;

  const onSignIn = async () => {
    if (!canSubmit) return;
    try {
      setError(null);
      setLoading(true);

      const { error: err } = await signIn(trimmedEmail, pass);
      if (err) {
        setError(err.message ?? "Sign-in failed.");
        return;
      }

      await setLastLoginEmail(trimmedEmail);
      // routing e gestionat de AuthProvider
    } catch (e: any) {
      setError(e?.message ?? "Unexpected error.");
    } finally {
      setLoading(false);
    }
  };

  const onProviderPress = async (kind: "google" | "apple" | "anonymous") => {
    setError(null);

    if (kind === "anonymous") {
      try {
        setLoading(true);
        const { error: anonErr } = await signInAnonymously();
        if (anonErr) setError(anonErr.message ?? "Anonymous sign-in failed.");
      } catch (e: any) {
        setError(e?.message ?? "Unexpected anonymous sign-in error.");
      } finally {
        setLoading(false);
      }
      return;
    }

    if (kind === "google") {
      try {
        setLoading(true);

        // Cerem URL-ul de OAuth de la supabase; redirectTo trebuie să existe în Supabase
        const { url, error: oauthErr } = await signInWithGoogle({ redirectTo });

        console.log("[DEBUG] signInWithGoogle returned url:", url, " error:", oauthErr);

        if (oauthErr) {
          setError(oauthErr.message ?? "Google sign-in failed.");
          setLoading(false);
          return;
        }
        if (!url) {
          setError("No authorization URL returned.");
          setLoading(false);
          return;
        }

        // deschide flow-ul în browser (Linking)
        await Linking.openURL(url);

        // nu setăm loading false imediat - așteptăm callback; dar pentru siguranță setăm fallback
        setTimeout(() => setLoading(false), 15000);
      } catch (e: any) {
        setError(e?.message ?? "Unexpected Google sign-in error.");
        setLoading(false);
      }
      return;
    }

    if (kind === "apple") {
      try {
        setLoading(true);

        const { url, error: oauthErr } = await signInWithApple({ redirectTo });

        console.log("[DEBUG] signInWithApple returned url:", url, " error:", oauthErr);

        if (oauthErr) {
          setError(oauthErr.message ?? "Apple sign-in failed.");
          setLoading(false);
          return;
        }
        if (!url) {
          setError("No authorization URL returned.");
          setLoading(false);
          return;
        }

        await Linking.openURL(url);
        setTimeout(() => setLoading(false), 15000);
      } catch (e: any) {
        setError(e?.message ?? "Unexpected Apple sign-in error.");
        setLoading(false);
      }
      return;
    }
  };

  return (
    <View style={{ ...ui.screenPadded, justifyContent: "center", gap: 12 }}>
      <Text style={theme.typography.titleLg}>Welcome back</Text>

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

      <View style={{ position: "relative" }}>
        <TextInput
          value={pass}
          onChangeText={setPass}
          placeholder="password"
          placeholderTextColor={theme.colors.muted}
          secureTextEntry={!show}
          textContentType="password"
          style={{
            ...ui.input,
            paddingRight: 44,
          }}
        />
        <Pressable
          onPress={() => setShow((s) => !s)}
          style={{ position: "absolute", right: 10, top: 12 }}
        >
          <Ionicons name={show ? "eye-off-outline" : "eye-outline"} size={22} />
        </Pressable>
      </View>

      {error && <ErrorBanner message={error} />}
      <LoadingOverlay visible={loading} />

      <Pressable
        onPress={onSignIn}
        disabled={!canSubmit}
        style={{
          ...ui.button,
          opacity: canSubmit ? 1 : 0.6,
        }}
        accessibilityLabel="Sign in with email and password"
      >
        <Text>{loading ? "Signing in..." : "Sign in"}</Text>
      </Pressable>

      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <Link href="/signup">
          <Text>Create account</Text>
        </Link>
        <Link href="/forgot">
          <Text>Forgot password?</Text>
        </Link>
      </View>

      <View style={{ ...ui.divider, backgroundColor: theme.colors.divider, marginVertical: 14 }} />
      <Text style={{ textAlign: "center" }}>Or continue with</Text>

      <View style={{ gap: 12, alignItems: "center", marginTop: 8 }}>
        <ProviderButton kind="google" onPress={() => onProviderPress("google")} />
        <ProviderButton kind="apple" onPress={() => onProviderPress("apple")} />
        <ProviderButton kind="anonymous" onPress={() => onProviderPress("anonymous")} />
      </View>
    </View>
  );
}
