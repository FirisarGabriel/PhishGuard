import { useEffect } from "react";
import { View, Text, Pressable } from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { theme } from "../../src/theme";
import { finishAttempt } from "../../src/repos/quiz";
import { evaluateQuizAchievements } from "../../src/repos/achievements";
import { useAchievementToast } from "../../src/achievements/AchievementToastProvider";
import { useAuth } from "../../src/auth/AuthProvider";
import { ui } from "../../src/ui";

export default function VisualQuizResults() {
  const { user } = useAuth();
  const { notifyAchievements } = useAchievementToast();
  const { attemptId, score, total } = useLocalSearchParams<{
    attemptId?: string;
    score: string;
    total: string;
  }>();
  const s = Number(score ?? 0);
  const t = Number(total ?? 1);
  const pct = Math.round((s / t) * 100);

  useEffect(() => {
    (async () => {
      if (!attemptId) {
        return;
      }

      try {
        await finishAttempt(String(attemptId), s);
        if (user?.id) {
          const unlocked = await evaluateQuizAchievements(user.id);
          notifyAchievements(unlocked);
        }
      } catch {
        // ignore persistence errors on the results screen
      }
    })();
  }, [attemptId, s, user?.id, notifyAchievements]);

  return (
    <View style={{ ...ui.screenPadded, ...ui.centered }}>
      <Text style={theme.typography.titleXl}>Visual Quiz Completed!</Text>
      <Text style={{ marginTop: 8, fontSize: 18, color: theme.colors.muted }}>
        You scored {s} out of {t} ({pct}%)
      </Text>

      <View style={{ flexDirection: "row", gap: 12, marginTop: 28 }}>
        <Pressable
          onPress={() => router.replace("/visual-quiz")}
          style={{
            ...ui.button,
            paddingVertical: 12,
            paddingHorizontal: 24,
          }}
        >
          <Text>Try Again</Text>
        </Pressable>

        <Pressable
          onPress={() => router.replace("/home")}
          style={{
            ...ui.button,
            paddingVertical: 12,
            paddingHorizontal: 24,
          }}
        >
          <Text>Back to Home</Text>
        </Pressable>
      </View>
    </View>
  );
}
