import React, { useEffect, useRef, useState } from "react";
import { View, Text, Pressable, StyleSheet, Animated, Image } from "react-native";
import { Link } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Network from "expo-network";

import { useRole } from "../src/auth/useRole";
import { useAuth } from "../src/auth/AuthProvider";
import { getAchievementsSeenAt } from "../src/secure";
import { getUnreadAchievementCount } from "../src/repos/achievements";
import { listMyPendingOrganizationInvites } from "../src/repos/b2b";
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

function formatCompanyRole(role?: string | null) {
  switch (role) {
    case "org_owner":
      return "owner";
    case "org_manager":
      return "manager";
    case "employee":
      return "employee";
    default:
      return "none";
  }
}

export default function Home() {
  const [offline, setOffline] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [pendingInviteCount, setPendingInviteCount] = useState(0);

  const { role, loading: roleLoading } = useRole();
  const { user, adminMode, organizations } = useAuth(); // preluăm din context
  const isAdmin = role === "ADMIN";
  const userId = user?.id ?? null;
  const hasActiveOrganization = organizations.some(
    (organization) => organization.membershipStatus === "active"
  );
  const activeOrganizationMembership =
    organizations.find((organization) => organization.membershipStatus === "active") ?? null;
  const showOrganizationButton = !!userId && (hasActiveOrganization || isAdmin);
  const organizationButtonLabel = isAdmin && adminMode ? "Create Org" : "Organization";
  const organizationButtonHref = isAdmin && adminMode ? "/organization-create" : "/organization";

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

  useFocusEffect(
    React.useCallback(() => {
      let alive = true;

      (async () => {
        if (!userId) {
          if (alive) setUnreadCount(0);
          return;
        }

        try {
          const seenAt = await getAchievementsSeenAt(userId);
          const [achievementTotal, pendingInvites] = await Promise.all([
            getUnreadAchievementCount(userId, seenAt),
            listMyPendingOrganizationInvites(),
          ]);

          if (alive) {
            setUnreadCount(achievementTotal);
            setPendingInviteCount(pendingInvites.length);
          }
        } catch {
          if (alive) {
            setUnreadCount(0);
            setPendingInviteCount(0);
          }
        }
      })();

      return () => {
        alive = false;
      };
    }, [userId])
  );

  const showOverlay = isAdmin && adminMode;
  const showFourButtonGrid = showOrganizationButton;

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.appBar}>
        <Text style={styles.appTitle}>PhishGuard</Text>
        <View style={styles.headerActions}>
          {userId && (
            <Link href="/organization-invites" asChild>
              <Pressable
                accessibilityLabel="Open invites"
                style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1, padding: 6 }]}
              >
                <View>
                  <Ionicons name="mail-open-outline" size={21} />
                  {pendingInviteCount > 0 && (
                    <View style={styles.achievementBadge}>
                      <Text style={styles.achievementBadgeText}>{pendingInviteCount}</Text>
                    </View>
                  )}
                </View>
              </Pressable>
            </Link>
          )}

          <Link href="/achievements" asChild>
            <Pressable
              accessibilityLabel="Open achievements"
              style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1, padding: 6 }]}
            >
              <View>
                <Ionicons name="trophy-outline" size={21} />
                {unreadCount > 0 && (
                  <View style={styles.achievementBadge}>
                    <Text style={styles.achievementBadgeText}>{unreadCount}</Text>
                  </View>
                )}
              </View>
            </Pressable>
          </Link>

          <Link href="/settings" asChild>
            <Pressable
              accessibilityLabel="Open settings"
              style={({ pressed }) => [{ opacity: pressed ? 0.6 : 1, padding: 6 }]}
            >
              <Ionicons name="settings-outline" size={22} />
            </Pressable>
          </Link>
        </View>
      </View>

      <Text style={styles.tagline}>Learn to spot phishing fast.</Text>

      <Text style={{ fontSize: 12, opacity: 0.6 }}>
        role = {roleLoading ? "loading..." : role ?? "none"}
        {` • companyRole=${formatCompanyRole(activeOrganizationMembership?.membershipRole)}`}
        {isAdmin ? ` • adminMode=${adminMode ? "ON" : "OFF"}` : ""}
      </Text>

      {offline && (
        <View style={styles.offlineBanner}>
          <Text style={styles.offlineText}>You’re offline — showing cached content</Text>
        </View>
      )}

      <View style={styles.heroWrap}>
        <Image
          source={require("../assets/home_phising_minimalist_ilustration.png")}
          style={styles.heroImage}
          resizeMode="cover"
        />
      </View>

      <View style={styles.bottomSection}>
        {showFourButtonGrid ? (
          <View style={styles.gridWrap}>
            <View style={styles.row}>
              <CircleButton
                label="Training"
                href="/training"
                size={110}
                icon={<Ionicons name="book-outline" size={38} />}
                showAdminOverlay={showOverlay}
              />

              <View style={{ width: 24 }} />

              <CircleButton
                label={organizationButtonLabel}
                href={organizationButtonHref}
                size={110}
                icon={<Ionicons name="business-outline" size={38} />}
              />
            </View>

            <View style={styles.row}>
              <CircleButton
                label="Classic Quiz"
                href="/classic-quiz"
                size={110}
                icon={<Ionicons name="help-circle-outline" size={38} />}
                showAdminOverlay={showOverlay}
              />

              <View style={{ width: 24 }} />

              <CircleButton
                label="Visual Quiz"
                href="/visual-quiz"
                size={110}
                icon={<MaterialCommunityIcons name="image-search-outline" size={38} />}
                showAdminOverlay={showOverlay}
              />
            </View>
          </View>
        ) : (
          <>
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
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.bg, paddingHorizontal: 20, paddingTop: 14 },
  appBar: { height: 44, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  appTitle: { fontSize: 20, fontWeight: "700" },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 12 },
  achievementBadge: {
    position: "absolute",
    top: -5,
    right: -7,
    minWidth: 16,
    height: 16,
    borderRadius: 999,
    backgroundColor: theme.colors.primary,
    borderWidth: 1,
    borderColor: theme.colors.surface1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  achievementBadgeText: {
    color: theme.colors.textInverse,
    fontSize: 10,
    fontWeight: "700",
  },
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

  heroWrap: {
    flex: 1,
    marginHorizontal: -20,
    paddingTop: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  heroImage: {
    width: "100%",
    height: 230,
  },

  bottomSection: {
    paddingBottom: 28,
    alignItems: "center",
  },

  gridWrap: {
    gap: 24,
    alignItems: "center",
  },

  row: { flexDirection: "row", justifyContent: "center" },

  circle: {
    backgroundColor: theme.colors.surface1,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: "center",
    justifyContent: "center",
    ...theme.elevation.card,
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
