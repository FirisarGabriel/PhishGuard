import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";

import { useAuth } from "../src/auth/AuthProvider";
import { getAchievementOverview } from "../src/repos/achievements";
import { theme } from "../src/theme";
import { ui } from "../src/ui";
import { setAchievementsSeenAt } from "../src/secure";

type AchievementRow = {
  id: string;
  title: string;
  description: string;
  unlockedAt: number | null;
};

export default function AchievementsScreen() {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const [rows, setRows] = useState<AchievementRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId) {
      setRows([]);
      setErr("Not signed in.");
      setLoading(false);
      return;
    }

    try {
      setErr(null);
      setLoading(true);
      const data = await getAchievementOverview(userId);
      setRows(data);
    } catch (e: any) {
      setErr(e?.message ?? "Failed to load achievements.");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      if (userId) {
        setAchievementsSeenAt(Date.now(), userId);
      }
      load();
    }, [load])
  );

  const unlockedCount = rows.filter((r) => !!r.unlockedAt).length;

  return (
    <View style={ui.screenPadded}>
      <Text style={theme.typography.titleMd}>Achievements</Text>
      <Text style={{ color: theme.colors.muted, marginTop: 4, marginBottom: 14 }}>
        Unlocked {unlockedCount}/{rows.length}
      </Text>

      {loading ? (
        <View style={{ ...ui.centered, flex: 1 }}>
          <ActivityIndicator />
          <Text style={{ marginTop: 8 }}>Loading achievements...</Text>
        </View>
      ) : err ? (
        <View style={ui.mutedPanel}>
          <Text style={{ color: theme.colors.error }}>{err}</Text>
          {userId && (
            <Pressable onPress={load} style={{ ...ui.button, marginTop: 10 }}>
              <Text>Retry</Text>
            </Pressable>
          )}
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingBottom: 18, gap: 12 }}
          showsVerticalScrollIndicator={false}
        >
          {rows.map((item) => {
            const unlocked = !!item.unlockedAt;
            return (
              <View
                key={item.id}
                style={{
                  ...ui.card,
                  padding: 14,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 12,
                  opacity: unlocked ? 1 : 0.85,
                  backgroundColor: unlocked ? theme.colors.surface1 : theme.colors.surface2,
                }}
              >
                <View
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 999,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: unlocked ? theme.colors.successBg : theme.colors.cardMuted,
                    borderWidth: 1,
                    borderColor: unlocked ? theme.colors.success : theme.colors.border,
                  }}
                >
                  <Ionicons
                    name={unlocked ? "trophy" : "trophy-outline"}
                    size={18}
                    color={unlocked ? theme.colors.success : theme.colors.muted}
                  />
                </View>

                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: "700", color: theme.colors.text }}>{item.title}</Text>
                  <Text style={{ color: theme.colors.muted, marginTop: 2 }}>{item.description}</Text>
                  <Text style={{ color: theme.colors.muted, marginTop: 5, fontSize: 12 }}>
                    {unlocked
                      ? `Unlocked on ${new Date(item.unlockedAt as number).toLocaleDateString()}`
                      : "Locked"}
                  </Text>
                </View>
              </View>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}
