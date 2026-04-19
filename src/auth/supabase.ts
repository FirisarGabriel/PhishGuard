import "react-native-url-polyfill/auto";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";
import Constants from "expo-constants";

const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, string>;

const SUPABASE_URL = extra.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = extra.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error("Missing Supabase URL/ANON KEY in app.json (expo.extra).");
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage as any,
    autoRefreshToken: true,
    persistSession: true,

    // IMPORTANT pentru mobile OAuth:
    // Folosim PKCE + schimbăm "code" -> session în auth-callback.
    flowType: "pkce",

    // detectSessionInUrl nu e esențial pe RN în PKCE, dar nu strică:
    detectSessionInUrl: false,
  },
});

export type { User, Session } from "@supabase/supabase-js";
