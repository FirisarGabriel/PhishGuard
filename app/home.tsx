import React, { useEffect, useRef, useState } from "react";
import { View, Text, Pressable, StyleSheet, Animated } from "react-native";
import { Link } from "expo-router";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Network from "expo-network";

import { useRole } from "../src/auth/useRole";
import { useAuth } from "../src/auth/AuthProvider";
import { theme } from "../src/theme";

function CircleButton({
  label,
  icon,
  size = 120,
  href,
  showAdminOverlay = false,
}: {
  label: string;
  icon: React.ReactNode;
  size?: number;
  href: string;
  showAdminOverlay?: boolean;
}) {
  const scale = useRef(new Animated.Value(1)).current;

  const pressIn = () =>
    Animated.spring(scale, {
      toValue: 0.96,
      useNativeDriver: true,
      speed: 20,
      bounciness: 8,
    }).start();

  const pressOut = () =>
    Animated.spring(scale, {
      toValue: 1,
      useNativeDriver: true,
      speed: 20,
      bounciness: 8,
    }).start();

  return (
    <Link href={href} asChild>
      <Pressable onPressIn={pressIn} onPressOut={pressOut} style={{ alignItems: "center" }}>
        <Animated.View
          style={[
            styles.circle,
            {
              width: size,
              height: size,
              borderRadius: size / 2,
              transform: [{ scale }],
            },
          ]}
        >
          {icon}

          {/* Admin overlay (doar vizual) */}
          {showAdminOverlay && (
            <View
              pointerEvents="none"
              style={[
                styles.adminOverlay,
                { width: size, height: size, borderRadius: size / 2 },
              ]}
            >
              <Ionicons name="pencil" size={22} />
            </View>
          )}
        </Animated.View>
        <Text style={styles.circleLabel}>{label}</Text>
      </Pressable>
    </Link>
  );
}

export default function Home() {
  const [offline, setOffline] = useState(false);

  const { role, loading: roleLoading } = useRole();
  const { adminMode } = useAuth(); // preluăm din context
  const isAdmin = role === "ADMIN";

  useEffect(() => {
    let mounted = true;

    const computeOffline = (s: Network.NetworkState) => {
      if (!s.isConnected) return true;
      if (s.isInternetReachable === false) return true;
      return false;
    };

    const apply = (s: Network.NetworkState) => {
      const off = computeOffline(s);
      if (mounted) setOffline(off);

      console.log("[network]", {
        isConnected: s.isConnected,
        isInternetReachable: s.isInternetReachable,
        offline: off,
        type: s.type,
      });
    };

    Network.getNetworkStateAsync().then(apply);
    const sub = Network.addNetworkStateListener(apply);

    return () => {
      mounted = false;
      if (sub && typeof (sub as any).remove === "function") (sub as any).remove();
    };
  }, []);

  const showOverlay = isAdmin && adminMode;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.appBar}>
        <Text style={styles.appTitle}>PhishGuard</Text>
        <Link href="/settings" asChild>
          <Pressable
            accessibilityLabel="Open settings"
            style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1, padding: 6 }]}
          >
            <Ionicons name="settings-outline" size={22} />
          </Pressable>
        </Link>
      </View>

      <Text style={styles.tagline}>Learn to spot phishing fast.</Text>

      <Text style={{ fontSize: 12, opacity: 0.6 }}>
        role = {roleLoading ? "loading..." : role ?? "none"}
        {isAdmin ? ` • adminMode=${adminMode ? "ON" : "OFF"}` : ""}
      </Text>

      {offline && (
        <View style={styles.offlineBanner}>
          <Text style={styles.offlineText}>You’re offline — showing cached content</Text>
        </View>
      )}

      <View style={{ flex: 1 }} />

      <View style={styles.bottomSection}>
        <View style={{ alignItems: "center", marginBottom: 24 }}>
          <CircleButton
            label="Training"
            href="/training"
            size={140}
            icon={<Ionicons name="book-outline" size={48} />}
            showAdminOverlay={showOverlay}
          />
        </View>

        <View style={styles.row}>
          <CircleButton
            label="Classic Quiz"
            href="/classic-quiz"
            icon={<Ionicons name="help-circle-outline" size={40} />}
            showAdminOverlay={showOverlay}
          />
          <View style={{ width: 24 }} />
          <CircleButton
            label="Visual Quiz"
            href="/visual-quiz"
            icon={<MaterialCommunityIcons name="image-search-outline" size={40} />}
            showAdminOverlay={showOverlay}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bg, paddingHorizontal: 20, paddingTop: 14 },
  appBar: { height: 44, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  appTitle: { fontSize: 20, fontWeight: "700" },
  tagline: { marginTop: 4, color: theme.colors.muted },

  offlineBanner: {
    marginTop: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: theme.colors.cardMuted,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  offlineText: { fontSize: 12, color: theme.colors.muted, textAlign: "center" },

  bottomSection: {
    paddingBottom: 28,
    alignItems: "center",
  },

  row: { flexDirection: "row", justifyContent: "center" },

  circle: {
    backgroundColor: theme.colors.card,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: theme.colors.shadow,
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  circleLabel: { marginTop: 10, fontWeight: "600" },

  adminOverlay: {
    position: "absolute",
    top: 0,
    right: 0,
    width: "100%",
    height: "100%",
    alignItems: "flex-end",
    justifyContent: "flex-start",
    paddingTop: 20,
    paddingRight: 16,
    backgroundColor: theme.colors.overlaySoft,
    overflow: "hidden",
  },
});
