import {
  useEffect,
  useRef,
  useState,
  createContext,
  useContext,
  ReactNode,
  useCallback,
} from "react";
import { View, ActivityIndicator, Text, Platform, AppState } from "react-native";
import { useRouter, usePathname } from "expo-router";
import * as LocalAuthentication from "expo-local-authentication";
import * as Network from "expo-network";

import { onAuthStateChanged, getSession, signOut } from "./service";
import type { Session, User } from "@supabase/supabase-js";
import { getBiometricEnabled, getHasSeenBiometricPrompt } from "../secure";

import {
  hydrateCachedAuthState,
  hydrateRemoteAuthState,
  setRole,
  type Role,
  type UserProfile,
} from "../repos/profile";
import type { OrganizationWithMembership } from "../repos/b2b";
import { runHybridSync } from "../sync/hybrid";

// IMPORTĂ funcțiile pentru adminMode
import { getAdminModeEnabled, setAdminModeEnabled } from "../secure";

type AuthContextType = {
  user: User | null;
  session: Session | null;
  loading: boolean;
  profile: UserProfile | null;
  organizations: OrganizationWithMembership[];
  platformRole: Role | null;
  refreshAuthState: () => Promise<void>;

  biometricLocked: boolean;
  unlockBiometric: () => void;

  // NEW: admin mode state + setter
  adminMode: boolean;
  setAdminMode: (v: boolean) => Promise<void>;
};

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  loading: true,
  profile: null,
  organizations: [],
  platformRole: null,
  refreshAuthState: async () => {},
  biometricLocked: false,
  unlockBiometric: () => {},
  adminMode: false,
  setAdminMode: async () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [organizations, setOrganizations] = useState<OrganizationWithMembership[]>([]);
  const [authzReady, setAuthzReady] = useState(false);

  // Bootstrap flag (vezi discuție anterioară)
  const [bootstrapped, setBootstrapped] = useState(false);

  const [biometricLocked, setBiometricLocked] = useState(false);
  const unlockBiometric = () => setBiometricLocked(false);

  // NEW: adminMode state
  const [adminMode, setAdminModeState] = useState<boolean>(false);

  const startupUserIdRef = useRef<string | null>(null);
  const didGateBiometric = useRef(false);
  const ensuredProfileForUserRef = useRef<string | null>(null);
  const syncedUserIdRef = useRef<string | null>(null);
  const syncInFlightRef = useRef(false);
  const lastSyncAtRef = useRef(0);
  const lastKnownOfflineRef = useRef<boolean | null>(null);

  const isAuthRoute =
    pathname === "/login" ||
    pathname === "/signup" ||
    pathname === "/forgot" ||
    pathname === "/biometric-enable" ||
    pathname === "/biometric-login" ||
    pathname === "/auth-callback";

  // 1) init session + subscribe
  useEffect(() => {
    let unsub = () => {};
    let alive = true;

    (async () => {
      try {
        setLoading(true);
        const s = await getSession();
        if (!alive) return;

        setSession(s);
        setUser(s?.user ?? null);
        startupUserIdRef.current = s?.user?.id ?? null;
      } finally {
        if (alive) setLoading(false);
      }

      unsub = onAuthStateChanged((_event, s2) => {
        setSession(s2);
        setUser(s2?.user ?? null);

        // primul event -> bootstrapped
        setBootstrapped(true);

        if (_event === "SIGNED_OUT") {
          startupUserIdRef.current = null;
          didGateBiometric.current = false;
          ensuredProfileForUserRef.current = null;
          syncedUserIdRef.current = null;
          setBiometricLocked(false);
          setAdminModeState(false); // curățăm adminMode la logout
          setProfile(null);
          setOrganizations([]);
          setAuthzReady(true);
        }
      });

      // fallback: dacă nu vine event rapid, tot bootstrappăm
      setTimeout(() => {
        if (alive) setBootstrapped(true);
      }, 800);
    })();

    return () => {
      alive = false;
      try {
        unsub();
      } catch {}
    };
  }, []);

  const ready = !loading && bootstrapped && authzReady;

  const refreshAuthState = useCallback(async () => {
    if (!user) {
      setProfile(null);
      setOrganizations([]);
      setAuthzReady(true);
      return;
    }

    setAuthzReady(false);

    try {
      const email = (user.email ?? "").trim().toLowerCase();
      const ADMIN_EMAIL = "gabrielfirisar@gmail.com";

      if (email === ADMIN_EMAIL) {
        await setRole(user.id, "ADMIN");
      }

      const nextState = await hydrateRemoteAuthState(user);
      setProfile(nextState.profile);
      setOrganizations(nextState.organizations);
      setAuthzReady(true);
    } catch {
      try {
        const cachedState = await hydrateCachedAuthState(user);
        setProfile(cachedState.profile);
        setOrganizations(cachedState.organizations);
        setAuthzReady(true);
      } catch {
        setProfile({
          userId: user.id,
          email: user.email ?? null,
          role: "USER",
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
        setOrganizations([]);
        setAuthzReady(true);
      }
    }
  }, [user]);

  const runSyncIfNeeded = useCallback(
    async (reason: "bootstrap" | "foreground" | "reconnect") => {
      if (!user?.id || !ready) {
        return;
      }

      if (syncInFlightRef.current) {
        return;
      }

      const now = Date.now();
      const minIntervalMs = reason === "bootstrap" ? 0 : 15_000;
      if (now - lastSyncAtRef.current < minIntervalMs) {
        return;
      }

      syncInFlightRef.current = true;
      try {
        await runHybridSync(user.id, { trigger: `auth_${reason}` });
        syncedUserIdRef.current = user.id;
        lastSyncAtRef.current = now;
      } catch {
        // ignore sync failures; cache and pending flags keep state recoverable
      } finally {
        syncInFlightRef.current = false;
      }
    },
    [ready, user?.id]
  );

  // hydrate profile + memberships remote-first with local fallback
  useEffect(() => {
    let alive = true;

    (async () => {
      if (loading || !bootstrapped) return;

      if (!user) {
        if (alive) {
          setProfile(null);
          setOrganizations([]);
          setAuthzReady(true);
        }
        return;
      }

      if (ensuredProfileForUserRef.current === user.id) return;

      if (alive) {
        setAuthzReady(false);
      }

      try {
        await refreshAuthState();
      } catch {
        try {
          const cachedState = await hydrateCachedAuthState(user);
          if (alive) {
            setProfile(cachedState.profile);
            setOrganizations(cachedState.organizations);
            setAuthzReady(true);
          }
        } catch {
          if (alive) {
            setProfile({
              userId: user.id,
              email: user.email ?? null,
              role: "USER",
              createdAt: Date.now(),
              updatedAt: Date.now(),
            });
            setOrganizations([]);
            setAuthzReady(true);
          }
        }
      } finally {
        ensuredProfileForUserRef.current = user.id;
      }
    })();

    return () => {
      alive = false;
    };
  }, [bootstrapped, loading, refreshAuthState, user]);

  useEffect(() => {
    if (!ready || !user?.id) {
      return;
    }

    if (syncedUserIdRef.current === user.id) {
      return;
    }

    void runSyncIfNeeded("bootstrap");
  }, [ready, runSyncIfNeeded, user?.id]);

  useEffect(() => {
    if (!ready || !user?.id) {
      lastKnownOfflineRef.current = null;
      return;
    }

    let alive = true;

    const computeOffline = (state: Network.NetworkState) => {
      if (!state.isConnected) return true;
      if (state.isInternetReachable === false) return true;
      return false;
    };

    const applyNetworkState = (state: Network.NetworkState) => {
      const offline = computeOffline(state);
      const wasOffline = lastKnownOfflineRef.current;
      lastKnownOfflineRef.current = offline;

      if (alive && wasOffline === true && offline === false) {
        void runSyncIfNeeded("reconnect");
      }
    };

    Network.getNetworkStateAsync().then((state) => {
      if (!alive) return;
      applyNetworkState(state);
    });

    const networkSub = Network.addNetworkStateListener(applyNetworkState);
    const appStateSub = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
        void runSyncIfNeeded("foreground");
      }
    });

    return () => {
      alive = false;
      if (networkSub && typeof (networkSub as any).remove === "function") {
        (networkSub as any).remove();
      }
      appStateSub.remove();
    };
  }, [ready, runSyncIfNeeded, user?.id]);

  // load adminMode from SecureStore when user changes (so it's reactive)
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!ready) return;
      if (!user) {
        if (alive) setAdminModeState(false);
        return;
      }
      try {
        const v = await getAdminModeEnabled(user.id);
        if (!alive) return;
        setAdminModeState(!!v);
      } catch {
        if (alive) setAdminModeState(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [ready, user?.id]);

  // setter public care actualizează SecureStore + state
  const setAdminMode = async (v: boolean) => {
    const uid = user?.id ?? null;
    if (!uid) {
      setAdminModeState(false);
      return;
    }
    try {
      await setAdminModeEnabled(v, uid);
      setAdminModeState(!!v);
    } catch {
      // în caz de eroare, nu schimbi state-ul
    }
  };

  // if no user -> redirect to login (doar când ready)
  useEffect(() => {
    if (!ready) return;
    if (!user) {
      if (!isAuthRoute) router.replace("/login");
      return;
    }
  }, [ready, user, isAuthRoute, router]);

  // biometric gate (startup restore only)
  useEffect(() => {
    (async () => {
      if (!ready) return;
      if (!user) return;
      if (didGateBiometric.current) return;
      if (Platform.OS !== "android") return;

      // only if restored at startup
      if (!startupUserIdRef.current || user.id !== startupUserIdRef.current) return;

      try {
        const seen = await getHasSeenBiometricPrompt(user.id);
        if (!seen) return;

        const enabled = await getBiometricEnabled(user.id);
        if (!enabled) {
          // do not sign out automatically here
          setBiometricLocked(false);

          didGateBiometric.current = true;

          //router.replace("/login");
          
          return;
        }

        const hasHardware = await LocalAuthentication.hasHardwareAsync();
        const isEnrolled = await LocalAuthentication.isEnrolledAsync();
        if (!hasHardware || !isEnrolled) return;

        setBiometricLocked(true);
        didGateBiometric.current = true;

        if (pathname !== "/biometric-login") {
          router.replace("/biometric-login");
        }
      } catch {
        // ignore
      }
    })();
  }, [ready, user, pathname, router]);

  // if locked, force biometric-login
  useEffect(() => {
    if (!ready) return;
    if (!user) return;
    if (!biometricLocked) return;

    if (pathname !== "/biometric-login") {
      router.replace("/biometric-login");
    }
  }, [ready, biometricLocked, pathname, user, router]);

  // routing after login/signup (only when ready)
  useEffect(() => {
    (async () => {
      if (!ready) return;
      if (!user) return;
      if (biometricLocked) return;

      if (isAuthRoute) {
        const seen = await getHasSeenBiometricPrompt(user.id);

        if (!seen && pathname !== "/biometric-enable") {
          router.replace("/biometric-enable");
          return;
        }

        if (seen && pathname !== "/biometric-login") {
          router.replace("/home");
        }
      }
    })();
  }, [ready, user, biometricLocked, isAuthRoute, pathname, router]);

  if (!ready) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator />
        <Text style={{ marginTop: 8 }}>Loading session…</Text>
      </View>
    );
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        loading: !ready,
        profile,
        organizations,
        platformRole: profile?.role ?? null,
        refreshAuthState,
        biometricLocked,
        unlockBiometric,
        adminMode,
        setAdminMode,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
