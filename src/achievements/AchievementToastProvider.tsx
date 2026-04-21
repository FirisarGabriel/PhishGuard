import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing, Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ACHIEVEMENT_BY_ID } from "./catalog";
import { theme } from "../theme";

type ToastContextValue = {
  notifyAchievements: (achievementIds: string[]) => void;
};

const AchievementToastContext = createContext<ToastContextValue>({
  notifyAchievements: () => {},
});

export function useAchievementToast() {
  return useContext(AchievementToastContext);
}

type QueueItem = {
  achievementId: string;
  title: string;
};

export function AchievementToastProvider({ children }: { children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [active, setActive] = useState<QueueItem | null>(null);

  const translateY = useRef(new Animated.Value(-40)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const notifyAchievements = useCallback((achievementIds: string[]) => {
    if (!achievementIds.length) return;

    const next = achievementIds
      .map((id) => {
        const meta = ACHIEVEMENT_BY_ID[id];
        if (!meta) return null;
        return { achievementId: id, title: meta.title };
      })
      .filter((item): item is QueueItem => !!item);

    if (!next.length) return;

    setQueue((prev) => [...prev, ...next]);
  }, []);

  useEffect(() => {
    if (active || queue.length === 0) return;
    const [first, ...rest] = queue;
    setActive(first);
    setQueue(rest);
  }, [active, queue]);

  useEffect(() => {
    if (!active) return;

    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 180,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.spring(translateY, {
        toValue: 0,
        speed: 18,
        bounciness: 7,
        useNativeDriver: true,
      }),
    ]).start();

    hideTimeoutRef.current = setTimeout(() => {
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 0,
          duration: 160,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: -28,
          duration: 160,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start(() => {
        setActive(null);
        translateY.setValue(-40);
      });
    }, 2600);

    return () => {
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current);
      }
    };
  }, [active, opacity, translateY]);

  const contextValue = useMemo(
    () => ({ notifyAchievements }),
    [notifyAchievements]
  );

  return (
    <AchievementToastContext.Provider value={contextValue}>
      {children}

      {active && (
        <View
          pointerEvents="box-none"
          style={{
            position: "absolute",
            top: insets.top + 10,
            left: 0,
            right: 0,
            alignItems: "center",
            zIndex: 999,
          }}
        >
          <Animated.View
            style={{
              opacity,
              transform: [{ translateY }],
              width: "90%",
              borderWidth: 1,
              borderColor: theme.colors.success,
              backgroundColor: theme.colors.successBg,
              borderRadius: 12,
              paddingHorizontal: 12,
              paddingVertical: 10,
              flexDirection: "row",
              alignItems: "center",
              gap: 10,
              ...theme.elevation.floating,
            }}
          >
            <Ionicons name="trophy" size={18} color={theme.colors.success} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontWeight: "700", color: theme.colors.text }}>
                Achievement unlocked
              </Text>
              <Text style={{ color: theme.colors.muted }}>{active.title}</Text>
            </View>
            <Pressable onPress={() => setActive(null)} hitSlop={8}>
              <Ionicons name="close" size={18} color={theme.colors.muted} />
            </Pressable>
          </Animated.View>
        </View>
      )}
    </AchievementToastContext.Provider>
  );
}
