import { useEffect } from "react";
import { View, Text, Pressable } from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { theme } from "../../src/theme";
import { finishAttempt } from "../../src/repos/quiz";

export default function VisualQuizResults() {
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
      } catch {
        // ignore persistence errors on the results screen
      }
    })();
  }, [attemptId, s]);

  return (
    <View style={{ flex: 1, justifyContent: "center", alignItems: "center", padding: 24 }}>
      <Text style={{ fontSize: 26, fontWeight: "700" }}>Visual Quiz Completed!</Text>
      <Text style={{ marginTop: 8, fontSize: 18, color: theme.colors.muted }}>
        You scored {s} out of {t} ({pct}%)
      </Text>

      <View style={{ flexDirection: "row", gap: 12, marginTop: 28 }}>
        <Pressable
          onPress={() => router.replace("/visual-quiz")}
          style={{
            borderWidth: 1,
            borderColor: theme.colors.border,
            borderRadius: theme.radius,
            paddingVertical: 12,
            paddingHorizontal: 24,
          }}
        >
          <Text>Try Again</Text>
        </Pressable>

        <Pressable
          onPress={() => router.replace("/home")}
          style={{
            borderWidth: 1,
            borderColor: theme.colors.border,
            borderRadius: theme.radius,
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
