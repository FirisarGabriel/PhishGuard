import { useLocalSearchParams, router } from "expo-router";
import { View, Text, ScrollView, Pressable, ActivityIndicator } from "react-native";
import { useEffect, useState, useCallback } from "react";
import { ErrorBanner } from "../../src/Feedback";
import ProgressBar from "../../src/ProgressBar";
import { theme } from "../../src/theme";
import { useAuth } from "../../src/auth/AuthProvider";

// DB
import { getLessonById, getProgressMap, markProgress } from "../../src/repos/lessons";
import type { Lesson } from "../../src/types/models";

export default function LessonDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [progress, setProgress] = useState(0);

  const { user } = useAuth();
  const userId = user?.id ?? null;

  const load = useCallback(async () => {
    if (!userId) {
      setErr("Not signed in.");
      setLesson(null);
      setProgress(0);
      setLoading(false);
      return;
    }

    try {
      setErr(null);
      setLoading(true);

      const lessonId = String(id);
      const [l, pm] = await Promise.all([getLessonById(lessonId), getProgressMap(userId)]);

      if (!l) {
        setLesson(null);
        setErr("Lesson not found.");
        return;
      }

      setLesson(l);
      const p = pm[l.id]?.completion ?? 0;
      setProgress(typeof p === "number" ? p : 0);
    } catch (e: any) {
      setErr(e?.message ?? "Failed to load lesson.");
    } finally {
      setLoading(false);
    }
  }, [id, userId]);

  useEffect(() => {
    let alive = true;

    (async () => {
      if (!alive) return;
      await load();
    })();

    return () => {
      alive = false;
    };
  }, [load]);

  const onMarkDone = useCallback(async () => {
    if (!userId) {
      setErr("Not signed in.");
      return;
    }
    if (!lesson) return;

    try {
      await markProgress(userId, lesson.id, 100);
      setProgress(100);
    } catch (e: any) {
      setErr(e?.message ?? "Failed to save progress.");
    }
  }, [userId, lesson]);

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator />
      </View>
    );
  }

  if (err || !lesson) {
    return (
      <View style={{ flex: 1, padding: 20, gap: 12 }}>
        <ErrorBanner message={err ?? "Unknown error"} />
        <Pressable
          onPress={() => router.back()}
          style={{
            borderWidth: 1,
            borderColor: theme.colors.border,
            borderRadius: theme.radius,
            padding: 12,
          }}
        >
          <Text>Back</Text>
        </Pressable>

        {/* optional: retry if user is signed in */}
        {userId && (
          <Pressable
            onPress={load}
            style={{
              borderWidth: 1,
              borderColor: theme.colors.border,
              borderRadius: theme.radius,
              padding: 12,
            }}
          >
            <Text>Retry</Text>
          </Pressable>
        )}
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      {/* Header */}
      <View style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: theme.colors.border }}>
        <Text style={{ fontSize: 20, fontWeight: "700" }}>{lesson.title}</Text>
        <View style={{ marginTop: 8 }}>
          <ProgressBar value={progress} />
        </View>
      </View>

      {/* Content */}
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        {(lesson.content ?? "").split("\n").map((line, idx) => (
          <Text
            key={idx}
            style={{
              fontSize: 16,
              lineHeight: 22,
              color: theme.colors.text,
              marginBottom: 8,
            }}
          >
            {line}
          </Text>
        ))}
      </ScrollView>

      {/* Footer actions */}
      <View style={{ padding: 16, borderTopWidth: 1, borderTopColor: theme.colors.border }}>
        <Pressable
          onPress={onMarkDone}
          style={({ pressed }) => ({
            opacity: pressed ? 0.8 : 1,
            borderWidth: 1,
            borderColor: theme.colors.border,
            borderRadius: theme.radius,
            padding: 14,
            alignItems: "center",
            backgroundColor: "white",
          })}
          accessibilityLabel="Mark lesson as done"
        >
          <Text style={{ fontWeight: "600" }}>
            {progress === 100 ? "Completed ✓" : "Mark as done"}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
