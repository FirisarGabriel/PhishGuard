import { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ActivityIndicator,
  FlatList,
  RefreshControl,
  Alert,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { ErrorBanner } from "../../src/Feedback";
import { theme } from "../../src/theme";
import { ui } from "../../src/ui";
import ProgressBar from "../../src/ProgressBar";
import { useAuth } from "../../src/auth/AuthProvider";
import { useRole } from "../../src/auth/useRole";

// ===== DB imports =====
import { getLessons, getProgressMap, deleteLesson } from "../../src/repos/lessons";
import type { Lesson } from "../../src/types/models";

type ProgressMap = Record<string, number>; // lessonId -> 0..100

export default function LessonList() {
  const router = useRouter();

  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [progress, setProgress] = useState<ProgressMap>({});

  const { user, adminMode } = useAuth();
  const { role } = useRole();

  const userId = user?.id ?? null;
  const isAdminUi = role === "ADMIN" && adminMode;

  /**
   * IMPORTANT:
   * - load NU este chemat în render
   * - load NU face setState infinit
   * - load depinde doar de userId
   */
  const load = useCallback(async () => {
    if (!userId) {
      // user neautentificat → nu încărcăm nimic
      setLessons([]);
      setProgress({});
      setLoading(false);
      return;
    }

    try {
      setErr(null);
      setLoading(true);

      const [ls, pm] = await Promise.all([getLessons(), getProgressMap(userId)]);

      setLessons(ls);

      const map: ProgressMap = {};
      Object.values(pm).forEach((p: any) => {
        map[p.lessonId] = typeof p.completion === "number" ? p.completion : 0;
      });
      setProgress(map);
    } catch (e: any) {
      setErr(e?.message ?? "Failed to load lessons.");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  // initial load + când se schimbă user-ul
  useEffect(() => {
    load();
  }, [load]);

  // reload când revii pe ecran
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const data = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return lessons;
    return lessons.filter(
      (l) =>
        l.title.toLowerCase().includes(term) ||
        l.summary.toLowerCase().includes(term)
    );
  }, [q, lessons]);

  const goToLesson = useCallback(
    (id: string) => {
      router.push({ pathname: "/training/[id]", params: { id } });
    },
    [router]
  );

  const goToCreate = useCallback(() => {
    router.push("/training/edit");
  }, [router]);

  const goToEdit = useCallback(
    (id: string) => {
      router.push({ pathname: "/training/edit", params: { id } });
    },
    [router]
  );

  const onDelete = useCallback(
    (lesson: Lesson) => {
      Alert.alert(
        "Delete training?",
        `This will permanently delete "${lesson.title}".`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete",
            style: "destructive",
            onPress: async () => {
              try {
                await deleteLesson(lesson.id);
                await load();
              } catch (e: any) {
                Alert.alert(
                  "Delete failed",
                  e?.message ?? "Could not delete training."
                );
              }
            },
          },
        ]
      );
    },
    [load]
  );

  // ===== UI states =====
  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator />
      </View>
    );
  }

  if (err) {
    return (
      <View
        style={{
          flex: 1,
          padding: 20,
          gap: 12,
          backgroundColor: theme.colors.bg,
        }}
      >
        <ErrorBanner message={err} />
        <Pressable
          onPress={load}
          style={{
            ...ui.button,
            padding: 12,
          }}
        >
          <Text>Retry</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg, padding: 16 }}>
      {/* Header */}
      <Text style={theme.typography.titleLg}>Training</Text>
      <Text style={{ color: theme.colors.muted, marginTop: 4 }}>
        Short lessons you can finish fast.
      </Text>

      {/* Search */}
      <View style={{ marginTop: 12, marginBottom: 8 }}>
        <TextInput
          placeholder="Search lessons"
          placeholderTextColor={theme.colors.muted}
          value={q}
          onChangeText={setQ}
          style={ui.input}
        />
      </View>

      {/* Admin actions (only if ADMIN + Admin Mode ON) */}
      {isAdminUi && (
        <View
          style={{
            flexDirection: "row",
            justifyContent: "flex-end",
            marginBottom: 8,
          }}
        >
          <Pressable
            onPress={goToCreate}
            style={({ pressed }) => ({
              ...ui.button,
              backgroundColor: pressed ? theme.colors.cardPressed : theme.colors.surface1,
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              paddingVertical: 10,
              paddingHorizontal: 12,
            })}
          >
            <Ionicons name="add" size={18} />
            <Text style={{ fontWeight: "700" }}>Add new training</Text>
          </Pressable>
        </View>
      )}

      {/* List */}
      <FlatList
        data={data}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingVertical: 12 }}
        ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        renderItem={({ item }) => {
          const p = progress[item.id] ?? 0;

          return (
            <Pressable
              onPress={() => goToLesson(item.id)}
              style={({ pressed }) => ({
                ...ui.cardElevated,
                backgroundColor: pressed ? theme.colors.cardPressed : theme.colors.surface1,
                borderColor: pressed ? theme.colors.borderStrong : theme.colors.border,
                padding: 14,
              })}
            >
              {/* Title row + admin buttons */}
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                }}
              >
                <Text style={{ fontSize: 16, fontWeight: "700", flex: 1 }}>
                  {item.title}
                </Text>

                {isAdminUi && (
                  <View style={{ flexDirection: "row", gap: 10 }}>
                    <Pressable
                      onPress={() => goToEdit(item.id)}
                      hitSlop={10}
                      style={({ pressed }) => ({
                        ...ui.card,
                        opacity: pressed ? 0.7 : 1,
                        padding: 6,
                        borderRadius: 999,
                      })}
                    >
                      <Ionicons name="pencil" size={16} />
                    </Pressable>

                    <Pressable
                      onPress={() => onDelete(item)}
                      hitSlop={10}
                      style={({ pressed }) => ({
                        ...ui.card,
                        opacity: pressed ? 0.7 : 1,
                        padding: 6,
                        borderRadius: 999,
                      })}
                    >
                      <Ionicons name="trash" size={16} />
                    </Pressable>
                  </View>
                )}
              </View>

              <Text style={{ color: theme.colors.muted, marginTop: 6 }}>
                {item.summary}
              </Text>

              <View style={{ marginTop: 10 }}>
                <ProgressBar value={p} />
              </View>
            </Pressable>
          );
        }}
        ListEmptyComponent={
          <View style={{ alignItems: "center", marginTop: 40 }}>
            <Text style={{ color: theme.colors.muted }}>
              No lessons match your search.
            </Text>
          </View>
        }
      />
    </View>
  );
}


