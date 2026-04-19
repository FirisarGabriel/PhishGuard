import { useEffect, useState } from "react";
import { View, Text, Pressable, ScrollView, ActivityIndicator } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { theme } from "../../src/theme";
import { getQuestions, getOptions } from "../../src/repos/quiz";
import type { Question, Option } from "../../src/types/models";

export default function QuizQuestion() {
  const router = useRouter();
  const { quizId, attemptId } = useLocalSearchParams<{ quizId: string; attemptId: string }>();

  const [questions, setQuestions] = useState<Question[]>([]);
  const [options, setOptions] = useState<Option[]>([]);
  const [index, setIndex] = useState(0);

  const [selected, setSelected] = useState<string | null>(null);
  const [showFeedback, setShowFeedback] = useState(false);
  const [score, setScore] = useState(0);

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // load questions, then first question's options
  useEffect(() => {
    (async () => {
      try {
        setErr(null);
        setLoading(true);
        const qs = await getQuestions(String(quizId));
        if (!qs.length) throw new Error("No questions found.");
        setQuestions(qs);
        const firstOpts = await getOptions(qs[0].id);
        setOptions(firstOpts);
      } catch (e: any) {
        setErr(e?.message ?? "Failed to load quiz.");
      } finally {
        setLoading(false);
      }
    })();
  }, [quizId]);

  // when index changes, load options for that question
  useEffect(() => {
    (async () => {
      if (!questions[index]) return;
      const opts = await getOptions(questions[index].id);
      setOptions(opts);
    })();
  }, [index, questions]);

  const q = questions[index];
  const total = questions.length;
  const isLast = index === total - 1;

  const handleSelect = (optId: string) => {
    if (showFeedback) return; // prevent double tap
    setSelected(optId);
    setShowFeedback(true);

    const isCorrect = options.find((o) => o.id === optId)?.isCorrect === 1;
    if (isCorrect) setScore((s) => s + 1);
  };

  const handleNext = () => {
    if (!showFeedback) return;
    if (isLast) {
      router.replace({
        pathname: "/classic-quiz/results",
        params: { attemptId, score: String(score), total: String(total) },
      });
    } else {
      setIndex((i) => i + 1);
      setSelected(null);
      setShowFeedback(false);
    }
  };

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator />
      </View>
    );
  }

  if (err || !q) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24 }}>
        <Text style={{ fontSize: 18, fontWeight: "700", marginBottom: 8 }}>Classic Quiz</Text>
        <Text style={{ color: theme.colors.muted, textAlign: "center" }}>
          {err ?? "Unknown error"}
        </Text>
      </View>
    );
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: "white" }} contentContainerStyle={{ padding: 20 }}>
      <Text style={{ fontSize: 18, fontWeight: "700" }}>
        Question {index + 1} of {total}
      </Text>

      <Text style={{ marginTop: 12, fontSize: 18 }}>{q.text}</Text>

      <View style={{ marginTop: 20, gap: 12 }}>
        {options.map((opt) => {
          const pressed = selected === opt.id;
          const correct = opt.isCorrect === 1 && showFeedback;
          const wrong = pressed && opt.isCorrect !== 1 && showFeedback;

          return (
            <Pressable
              key={opt.id}
              onPress={() => handleSelect(opt.id)}
              style={{
                borderWidth: 2,
                borderColor: correct
                  ? theme.colors.success
                  : wrong
                  ? theme.colors.error
                  : theme.colors.border,
                backgroundColor: pressed ? "#f9fafb" : "white",
                borderRadius: theme.radius,
                padding: 14,
              }}
            >
              <Text style={{ fontSize: 16 }}>{opt.text}</Text>
            </Pressable>
          );
        })}
      </View>

      {/* feedback explanation: stored at Question level in DB */}
      {showFeedback && (
        <Text
          style={{
            marginTop: 12,
            color: theme.colors.muted,
            fontSize: 14,
          }}
        >
          {q.explanation ?? ""}
        </Text>
      )}

      <Pressable
        onPress={handleNext}
        disabled={!showFeedback}
        style={{
          marginTop: 24,
          padding: 14,
          borderWidth: 1,
          borderColor: theme.colors.border,
          borderRadius: theme.radius,
          alignItems: "center",
          opacity: showFeedback ? 1 : 0.6,
          backgroundColor: "white",
        }}
        accessibilityLabel={isLast ? "Finish Quiz" : "Next Question"}
      >
        <Text>{isLast ? "Finish Quiz" : "Next Question"}</Text>
      </Pressable>
    </ScrollView>
  );
}
