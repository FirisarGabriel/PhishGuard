import * as SecureStore from "expo-secure-store";

const KEY_BIOMETRIC = "biometricEnabled";
const KEY_LAST_EMAIL = "lastLoginEmail";
const KEY_SEEN_PROMPT = "hasSeenBiometricPrompt";

/**
 * Pentru a evita ca preferințele biometrice să se “moștenească” între conturi,
 * cheile sunt scoped per userId (ex: biometricEnabled:<userId>).
 *
 * lastLoginEmail rămâne global (e ok pentru prefill).
 */
const scopedKey = (base: string, userId?: string | null) =>
  userId ? `${base}.${userId}` : base;

/* ─────────────── Admin Mode ON/OFF ─────────────── */
const k = (userId: string, key: string) => `${key}.${userId}`;

export async function getAdminModeEnabled(userId: string): Promise<boolean> {
  const v = await SecureStore.getItemAsync(k(userId, "adminMode"));
  return v === "1";
}

export async function setAdminModeEnabled(value: boolean, userId: string): Promise<void> {
  await SecureStore.setItemAsync(k(userId, "adminMode"), value ? "1" : "0");
}

/* ─────────────── Biometrics ON/OFF ─────────────── */

export async function setBiometricEnabled(v: boolean, userId?: string | null) {
  try {
    await SecureStore.setItemAsync(scopedKey(KEY_BIOMETRIC, userId), v ? "1" : "0");
  } catch (e) { console.warn("SecureStore error:", e); }
}

export async function getBiometricEnabled(userId?: string | null): Promise<boolean> {
  try {
    const v = await SecureStore.getItemAsync(scopedKey(KEY_BIOMETRIC, userId));
    return v === "1";
  } catch {
    return false;
  }
}

/**
 * Șterge doar flag-ul biometric pentru user-ul curent (dacă e furnizat userId).
 * Dacă nu e furnizat userId, șterge cheia globală (compatibilitate / fallback).
 */
export async function clearBiometric(userId?: string | null) {
  try {
    await SecureStore.deleteItemAsync(scopedKey(KEY_BIOMETRIC, userId));
  } catch (e) { console.warn("SecureStore error:", e); }
}

/* ─────────────── Ultimul email folosit ─────────────── */

export async function setLastLoginEmail(email: string) {
  try {
    await SecureStore.setItemAsync(KEY_LAST_EMAIL, email);
  } catch (e) { console.warn("SecureStore error:", e); }
}

export async function getLastLoginEmail(): Promise<string | null> {
  try {
    const v = await SecureStore.getItemAsync(KEY_LAST_EMAIL);
    return v ?? null;
  } catch {
    return null;
  }
}

export async function clearLastLoginEmail() {
  try {
    await SecureStore.deleteItemAsync(KEY_LAST_EMAIL);
  } catch (e) { console.warn("SecureStore error:", e); }
}

/* ─────────────── Flag: a văzut promptul biometric ─────────────── */

export async function setHasSeenBiometricPrompt(v: boolean, userId?: string | null) {
  try {
    await SecureStore.setItemAsync(scopedKey(KEY_SEEN_PROMPT, userId), v ? "1" : "0");
  } catch (e) { console.warn("SecureStore error:", e); }
}

export async function getHasSeenBiometricPrompt(userId?: string | null): Promise<boolean> {
  try {
    const v = await SecureStore.getItemAsync(scopedKey(KEY_SEEN_PROMPT, userId));
    return v === "1";
  } catch {
    return false;
  }
}

/**
 * Opțional: util când vrei să resetezi doar pentru user-ul curent (ex: debugging).
 */
export async function clearHasSeenBiometricPrompt(userId?: string | null) {
  try {
    await SecureStore.deleteItemAsync(scopedKey(KEY_SEEN_PROMPT, userId));
  } catch (e) { console.warn("SecureStore error:", e); }
}
