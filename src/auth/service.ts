// db/src/auth/service.ts
import { supabase } from "./supabase";
import type { Session, User } from "@supabase/supabase-js";

/**
 * Sign up with email & password.
 * Optionally pass user metadata (e.g., { name: "John Doe" }).
 */
export async function signUp(
  email: string,
  password: string,
  metadata?: Record<string, any>
): Promise<{ user?: User | null; session?: Session | null; error: any | null }> {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: metadata ?? {},
      // Dacă vrei link de confirmare + reset în viitor, poți seta:
      // emailRedirectTo: "https://localhost", // setează în Supabase Auth → URL configuration
    },
  });
  return { user: data.user, session: data.session, error };
}

/**
 * Sign in with email & password.
 */
export async function signIn(
  email: string,
  password: string
): Promise<{ user?: User | null; session?: Session | null; error: any | null }> {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  return { user: data.user, session: data.session, error };
}

/**
 * Sign in anonymously (creates an anonymous user).
 * Supabase supports anonymous sign-ins via signInAnonymously().
 * Note: you must enable "Anonymous" in your Supabase project's Authentication settings.
 * Anonymous users are real auth users (they get a JWT with `is_anonymous` claim).
 * Docs: Supabase Anonymous Sign-ins.
 */
export async function signInAnonymously(): Promise<{ user?: User | null; session?: Session | null; error: any | null }> {
  // supabase.auth.signInAnonymously() returns { data, error } similar to other auth calls
  // Make sure anonymous auth is enabled in Supabase dashboard (Auth → Settings).
  const { data, error } = await supabase.auth.signInAnonymously();
  return { user: data.user ?? null, session: data.session ?? null, error };
}

/**
 * Generic OAuth sign-in helper using Supabase.
 *
 * For mobile (Expo) you typically provide a redirect URL that matches the one
 * configured in Supabase (Auth → Providers → Google/Apple → Redirect URLs).
 *
 * Example usage:
 *   await signInWithOAuth('google', { redirectTo: 'yourapp://auth-callback' });
 *
 * Notes:
 * - Supabase JS exposes `signInWithOAuth({ provider, options })` for social providers.
 * - On Expo, many people use expo-auth-session to construct redirect URIs and open the browser,
 *   but using supabase.auth.signInWithOAuth() with a proper redirectTo usually works.
 * - You must enable the provider (Google / Apple) in your Supabase project and add the redirect URI.
 * Docs: Supabase Social Login (Google/Apple).
 */
export async function signInWithOAuth(
  provider: "google" | "apple" | string,
  options?: { redirectTo?: string; scopes?: string }
): Promise<{ url?: string | null; data?: any; error?: any }> {
  // signInWithOAuth returns { data, error } where data may contain `url` for the auth flow
  // We forward the response to the caller so the screen can open the returned url if needed.
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: provider as string,
    options: {
      redirectTo: options?.redirectTo,
      scopes: options?.scopes,
    },
  } as any); // cast because supabase types may expect specific provider union
  return { url: data?.url ?? null, data, error };
}

/**
 * Convenience wrappers for Google / Apple sign-in.
 * They call signInWithOAuth under the hood.
 *
 * IMPORTANT (mobile/Expo):
 * - Configure the provider in Supabase (add redirect URI).
 * - Common redirect URI for Expo using expo-auth-session is: AuthSession.makeRedirectUri({ useProxy: true })
 * - If you provide `redirectTo`, it must match a value in Supabase's redirect list for that provider.
 *
 * Example:
 *   const { url, error } = await signInWithGoogle({ redirectTo: 'yourapp://auth-callback' });
 *   if (url) WebBrowser.openBrowserAsync(url) // or use Linking.openURL(url)
 */
export async function signInWithGoogle(options?: { redirectTo?: string; scopes?: string }) {
  return signInWithOAuth("google", options);
}

export async function signInWithApple(options?: { redirectTo?: string; scopes?: string }) {
  return signInWithOAuth("apple", options);
}

/**
 * Send password reset email.
 * You can set a redirect URL in Supabase → Authentication → URL Configuration.
 */
export async function sendPasswordReset(email: string): Promise<{ error: any | null }> {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    // redirectTo: "https://localhost", // opțional, dacă ai setat acest URL în Supabase
  });
  return { error };
}

/**
 * Sign out (clears local session).
 */
export async function signOut(): Promise<{ error: any | null }> {
  const { error } = await supabase.auth.signOut();
  return { error };
}

/**
 * Subscribe to auth state changes.
 * Returns an unsubscribe function.
 */
export function onAuthStateChanged(
  handler: (event: "SIGNED_IN" | "SIGNED_OUT" | "TOKEN_REFRESHED" | "USER_UPDATED" | "PASSWORD_RECOVERY", session: Session | null) => void
): () => void {
  const { data: subscription } = supabase.auth.onAuthStateChange((event, session) => {
    handler(event as any, session);
  });
  return () => {
    subscription.subscription.unsubscribe();
  };
}

/**
 * Helpers you might use in AuthProvider or screens.
 */
export async function getCurrentUser(): Promise<User | null> {
  const { data } = await supabase.auth.getUser();
  return data.user ?? null;
}

export async function getSession(): Promise<Session | null> {
  const { data } = await supabase.auth.getSession();
  return data.session ?? null;
}
