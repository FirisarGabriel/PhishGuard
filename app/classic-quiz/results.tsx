import { useCallback, useEffect, useState } from "react";
import { View, Text, Pressable } from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { theme } from "../../src/theme";
import { finishAttempt, startAttempt } from "../../src/repos/quiz";
import { evaluateQuizAchievements } from "../../src/repos/achievements";
import { useAchievementToast } from "../../src/achievements/AchievementToastProvider";
import { useAuth } from "../../src/auth/AuthProvider";
import { ui } from "../../src/ui";

export default function QuizResults() {
  const router = useRouter();
  const { user } = useAuth();
  const { notifyAchievements } = useAchievementToast();
  const [retaking, setRetaking] = useState(false);
  const { quizId, attemptId, score, total } = useLocalSearchParams<{
    quizId: string;
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
          if (user?.id) {
            const unlocked = await evaluateQuizAchievements(user.id);
            notifyAchievements(unlocked);
          }
        } catch {
          // optional: show a toast/banner if you have one
        }
      }
    })();
  }, [attemptId, s, user?.id, notifyAchievements]);

  const onRetake = useCallback(async () => {
    if (!user?.id || !quizId || retaking) {
      if (!user?.id || !quizId) {
        router.replace("/classic-quiz");
      }
      return;
    }

    try {
      setRetaking(true);
      const nextAttemptId = await startAttempt(user.id, String(quizId));
      router.replace({
        pathname: "/classic-quiz/question",
        params: { quizId: String(quizId), attemptId: nextAttemptId, index: "0" },
      });
    } finally {
      setRetaking(false);
    }
  }, [quizId, retaking, router, user?.id]);

  return (
    <View style={{ ...ui.screenPadded, ...ui.centered }}>
      <Text style={theme.typography.titleXl}>Quiz Completed!</Text>
      <Text style={{ marginTop: 8, fontSize: 18, color: theme.colors.muted }}>
        You scored {s} out of {t} ({pct}%)
      </Text>

      <View style={{ width: "100%", maxWidth: 320, gap: 12, marginTop: 28 }}>
        <Pressable
          onPress={onRetake}
          disabled={retaking}
          style={{
            ...ui.button,
            paddingVertical: 12,
            paddingHorizontal: 24,
            opacity: retaking ? 0.7 : 1,
          }}
          accessibilityLabel="Retake Quiz"
        >
          <Text>Retake Quiz</Text>
        </Pressable>

        <Pressable
          onPress={() => router.replace("/classic-quiz")}
          style={{
            ...ui.button,
            paddingVertical: 12,
            paddingHorizontal: 24,
          }}
          accessibilityLabel="Back to Classic Quizzes"
        >
          <Text>Back to Classic Quizzes</Text>
        </Pressable>

        <Pressable
          onPress={() => router.replace("/home")}
          style={{
            ...ui.button,
            paddingVertical: 12,
            paddingHorizontal: 24,
          }}
          accessibilityLabel="Back to Home"
        >
          <Text>Back to Home</Text>
        </Pressable>
      </View>
    </View>
  );
}


