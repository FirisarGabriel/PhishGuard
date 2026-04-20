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
import { useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";

import { theme } from "../../src/theme";
import { ErrorBanner } from "../../src/Feedback";
import { ui } from "../../src/ui";
import { useAuth } from "../../src/auth/AuthProvider";
import { useRole } from "../../src/auth/useRole";

import {
  getQuizzesByKind,
  getBestScoresMapForKind,
  startAttempt,
  deleteQuiz,
} from "../../src/repos/quiz";
import type { Quiz } from "../../src/types/models";

export default function ClassicQuizList() {
  const router = useRouter();
  const { user, adminMode } = useAuth();
  const { role } = useRole();

  const userId = user?.id ?? null;
  const isAdminUi = role === "ADMIN" && adminMode;

  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [bestMap, setBestMap] = useState<Record<string, number>>({});
  const [startingQuizId, setStartingQuizId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!userId) {
      setErr("Not signed in.");
      setQuizzes([]);
      setBestMap({});
      setLoading(false);
      return;
    }

    try {
      setErr(null);
      setLoading(true);

      const [qs, bm] = await Promise.all([
        getQuizzesByKind("classic"),
        getBestScoresMapForKind(userId, "classic"),
      ]);

      setQuizzes(qs);
      setBestMap(bm);
    } catch (e: any) {
      setErr(e?.message ?? "Failed to load classic quizzes.");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    load();
  }, [load]);

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
    if (!term) return quizzes;
    return quizzes.filter(
      (x) =>
        x.title.toLowerCase().includes(term) ||
        (x.description ?? "").toLowerCase().includes(term)
    );
  }, [q, quizzes]);

  const onStart = useCallback(
    async (quiz: Quiz) => {
      if (!userId) return;
      try {
        setStartingQuizId(quiz.id);
        const attemptId = await startAttempt(userId, quiz.id);
        router.push({
          pathname: "/classic-quiz/question",
          params: { quizId: quiz.id, attemptId, index: "0" },
        });
      } catch (e: any) {
        setErr(e?.message ?? "Failed to start quiz.");
      } finally {
        setStartingQuizId(null);
      }
    },
    [router, userId]
  );

  const goToCreate = useCallback(() => {
    router.push("/classic-quiz/edit");
  }, [router]);

  const goToEdit = useCallback(
    (quizId: string) => {
      router.push({ pathname: "/classic-quiz/edit", params: { id: quizId } });
    },
    [router]
  );

  const onDelete = useCallback(
    (quiz: Quiz) => {
      Alert.alert(
        "Delete quiz?",
        `This will permanently delete "${quiz.title}" and its questions.`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete",
            style: "destructive",
            onPress: async () => {
              try {
                await deleteQuiz(quiz.id);
                await load();
              } catch (e: any) {
                Alert.alert("Delete failed", e?.message ?? "Could not delete quiz.");
              }
            },
          },
        ]
      );
    },
    [load]
  );

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
      <Text style={theme.typography.titleLg}>Classic Quizzes</Text>
      <Text style={{ color: theme.colors.muted, marginTop: 4 }}>
        Choose a quiz and test your phishing detection.
      </Text>

      {/* Search */}
      <View style={{ marginTop: 12, marginBottom: 8 }}>
        <TextInput
          placeholder="Search quizzes"
          placeholderTextColor={theme.colors.muted}
          value={q}
          onChangeText={setQ}
          style={ui.input}
        />
      </View>

      {/* Admin Add */}
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
              opacity: pressed ? 0.85 : 1,
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              paddingVertical: 10,
              paddingHorizontal: 12,
            })}
          >
            <Ionicons name="add" size={18} />
            <Text style={{ fontWeight: "700" }}>Add new quiz</Text>
          </Pressable>
        </View>
      )}

      <FlatList
        data={data}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingVertical: 8 }}
        ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        renderItem={({ item }) => {
          const best = bestMap[item.id];
          const bestLabel =
            typeof best === "number" ? `Best score: ${best}%` : "Not attempted yet";

          const starting = startingQuizId === item.id;

          return (
            <Pressable
              onPress={() => onStart(item)}
              disabled={starting}
              style={({ pressed }) => ({
                ...ui.card,
                opacity: pressed || starting ? 0.8 : 1,
                padding: 14,
              })}
              accessibilityLabel={`Start ${item.title}`}
            >
              <View style={{ flexDirection: "row", gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                    <Text style={{ fontSize: 16, fontWeight: "700" }}>{item.title}</Text>

                    {isAdminUi && (
                      <View style={{ flexDirection: "row", gap: 8 }}>
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

                  {/* Divider */}
                  <View
                    style={{
                      ...ui.divider,
                      height: 1,
                      marginVertical: 8,
                    }}
                  />

                  <Text style={{ color: theme.colors.muted }}>
                    {item.description ?? "Multiple choice quiz"}
                  </Text>

                  <Text style={{ marginTop: 8, fontWeight: "600" }}>{bestLabel}</Text>
                </View>
              </View>
            </Pressable>
          );
        }}
        ListEmptyComponent={
          <View style={{ alignItems: "center", marginTop: 40 }}>
            <Text style={{ color: theme.colors.muted }}>
              No quizzes match your search.
            </Text>
          </View>
        }
      />
    </View>
  );
}


