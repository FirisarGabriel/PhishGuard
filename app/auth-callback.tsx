import { useEffect, useRef, useState } from "react";
import { View, ActivityIndicator, Text } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { supabase } from "../src/auth/supabase";

export default function AuthCallback() {
  const router = useRouter();

  // IMPORTANT: expo-router pune query params aici când vine deep link-ul
  const params = useLocalSearchParams<{
    code?: string;
    error?: string;
    error_description?: string;
    access_token?: string;
    refresh_token?: string;
  }>();

  const [msg, setMsg] = useState("Finishing sign-in…");
  const doneRef = useRef(false);

  const finishTo = (path: "/home" | "/login") => {
    if (doneRef.current) return;
    doneRef.current = true;
    router.replace(path);
  };

  useEffect(() => {
    (async () => {
      if (doneRef.current) return;

      // 1) dacă deja ai session, mergi direct în home
      const { data: s0 } = await supabase.auth.getSession();
      if (s0.session) {
        setMsg("Session already exists. Redirecting…");
        finishTo("/home");
        return;
      }

      // 2) dacă avem eroare de la provider
      if (params.error || params.error_description) {
        setMsg(`OAuth error: ${params.error_description ?? params.error ?? "unknown"}`);
        setTimeout(() => finishTo("/login"), 1200);
        return;
      }

      // 3) PKCE: primim code în query
      if (params.code) {
        setMsg("Exchanging code for session…");

        const { error } = await supabase.auth.exchangeCodeForSession(params.code);
        if (error) {
          console.log("[AuthCallback] exchangeCodeForSession error:", error);
          setMsg("Exchange failed. Returning to login…");
          setTimeout(() => finishTo("/login"), 1200);
          return;
        }

        const { data } = await supabase.auth.getSession();
        if (data.session) {
          setMsg("Signed in! Redirecting…");
          setTimeout(() => finishTo("/home"), 200);
        } else {
          setMsg("No session after exchange. Returning to login…");
          setTimeout(() => finishTo("/login"), 1200);
        }
        return;
      }

      // 4) (fallback) dacă vine implicit-flow cu tokeni (rar aici)
      if (params.access_token && params.refresh_token) {
        setMsg("Setting session from tokens…");

        const { error } = await supabase.auth.setSession({
          access_token: params.access_token,
          refresh_token: params.refresh_token,
        });

        if (error) {
          console.log("[AuthCallback] setSession error:", error);
          setMsg("setSession failed. Returning to login…");
          setTimeout(() => finishTo("/login"), 1200);
          return;
        }

        setMsg("Signed in! Redirecting…");
        setTimeout(() => finishTo("/home"), 200);
        return;
      }

      // 5) dacă ajungi aici, înseamnă că ruta s-a deschis fără params (nu ar trebui)
      setMsg("No auth params received. Returning to login…");
      setTimeout(() => finishTo("/login"), 1500);
    })();
  }, [
    params.code,
    params.error,
    params.error_description,
    params.access_token,
    params.refresh_token,
    router,
  ]);

  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24 }}>
      <ActivityIndicator />
      <Text style={{ marginTop: 10, textAlign: "center" }}>{msg}</Text>
    </View>
  );
}
