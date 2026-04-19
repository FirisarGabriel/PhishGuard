import { useEffect } from "react";
import { View, Text, Pressable } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { theme } from "../../src/theme";
import { finishAttempt } from "../../src/repos/quiz";

export default function QuizResults() {
  const router = useRouter();
  const { attemptId, score, total } = useLocalSearchParams<{
    attemptId: string;
    score: string;
    total: string;
  }>();

  const s = Number(score ?? 0);
  const t = Math.max(1, Number(total ?? 1));
  const pct = Math.round((s / t) * 100);

  // Persist final score to SQLite
  useEffect(() => {
    (async () => {
      if (attemptId) {
        try {
          await finishAttempt(String(attemptId), s);
        } catch {
          // optional: show a toast/banner if you have one
        }
      }
    })();
  }, [attemptId, s]);

  return (
    <View style={{ flex: 1, justifyContent: "center", alignItems: "center", padding: 24 }}>
      <Text style={{ fontSize: 26, fontWeight: "700" }}>Quiz Completed!</Text>
      <Text style={{ marginTop: 8, fontSize: 18, color: theme.colors.muted }}>
        You scored {s} out of {t} ({pct}%)
      </Text>

      <View style={{ flexDirection: "row", gap: 12, marginTop: 28 }}>
        <Pressable
          onPress={() => router.replace("/classic-quiz")}
          style={{
            borderWidth: 1,
            borderColor: theme.colors.border,
            borderRadius: theme.radius,
            paddingVertical: 12,
            paddingHorizontal: 24,
            backgroundColor: "white",
          }}
          accessibilityLabel="Back to Classic Quizzes"
        >
          <Text>Back to Classic Quizzes</Text>
        </Pressable>

        <Pressable
          onPress={() => router.replace("/home")}
          style={{
            borderWidth: 1,
            borderColor: theme.colors.border,
            borderRadius: theme.radius,
            paddingVertical: 12,
            paddingHorizontal: 24,
            backgroundColor: "white",
          }}
          accessibilityLabel="Back to Home"
        >
          <Text>Back to Home</Text>
        </Pressable>
      </View>
    </View>
  );
}
