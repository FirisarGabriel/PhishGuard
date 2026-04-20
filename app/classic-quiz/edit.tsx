import { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ActivityIndicator,
  ScrollView,
  Alert,
} from "react-native";
import { useLocalSearchParams, router } from "expo-router";

import { theme } from "../../src/theme";
import { ui } from "../../src/ui";
import { ErrorBanner } from "../../src/Feedback";
import { useAuth } from "../../src/auth/AuthProvider";
import { useRole } from "../../src/auth/useRole";

import {
  createQuiz,
  getQuizById,
  updateQuiz,
  getQuestionsForQuiz,
  deleteQuestion,
} from "../../src/repos/quiz";
import type { Question } from "../../src/types/models";
import { Ionicons } from "@expo/vector-icons";

export default function ClassicQuizEdit() {
  const { id } = useLocalSearchParams<{ id?: string }>();

  const { user, adminMode } = useAuth();
  const { role } = useRole();
  const isAdminUi = role === "ADMIN" && adminMode;

  const isEdit = useMemo(() => !!id && String(id).length > 0, [id]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [slug, setSlug] = useState("");

  const [questions, setQuestions] = useState<Question[]>([]);
  const [qLoading, setQLoading] = useState(false);

  const loadQuestions = useCallback(
    async (quizId: string) => {
      try {
        setQLoading(true);
        const qs = await getQuestionsForQuiz(quizId);
        setQuestions(qs);
      } catch (e: any) {
        // nu blocăm ecranul pentru asta; arătăm error banner doar dacă e nevoie
        setErr((prev) => prev ?? e?.message ?? "Failed to load questions.");
      } finally {
        setQLoading(false);
      }
    },
    []
  );

  const load = useCallback(async () => {
    // gating
    if (!user?.id) {
      setErr("Not signed in.");
      setLoading(false);
      return;
    }
    if (!isAdminUi) {
      setErr("Admin Mode is required to edit quizzes.");
      setLoading(false);
      return;
    }

    try {
      setErr(null);
      setLoading(true);

      if (!isEdit) {
        setTitle("");
        setDescription("");
        setSlug("");
        setQuestions([]);
        return;
      }

      const quizId = String(id);
      const q = await getQuizById(quizId);
      if (!q) {
        setErr("Quiz not found.");
        return;
      }

      setTitle(q.title ?? "");
      setDescription(q.description ?? "");
      setSlug(q.slug ?? "");

      await loadQuestions(quizId);
    } catch (e: any) {
      setErr(e?.message ?? "Failed to load quiz.");
    } finally {
      setLoading(false);
    }
  }, [id, isAdminUi, isEdit, loadQuestions, user?.id]);

  useEffect(() => {
    load();
  }, [load]);

  const validate = useCallback(() => {
    if (!title.trim()) return "Title is required.";
    return null;
  }, [title]);

  const onSave = useCallback(async () => {
    const v = validate();
    if (v) {
      Alert.alert("Fix the form", v);
      return;
    }

    try {
      setErr(null);
      setSaving(true);

      if (isEdit) {
        await updateQuiz(String(id), {
          title: title.trim(),
          description: description.trim() || null,
          slug: slug.trim() || undefined,
        });
      } else {
        const created = await createQuiz({
          title: title.trim(),
          description: description.trim() || null,
          kind: "classic",
          slug: slug.trim() || undefined,
        });

        // după create, mergem automat la edit ca să poți adăuga întrebări
        router.replace({
          pathname: "/classic-quiz/edit",
          params: { id: created.id },
        });
        return;
      }

      Alert.alert("Saved", "Quiz updated.");
    } catch (e: any) {
      setErr(e?.message ?? "Failed to save quiz.");
    } finally {
      setSaving(false);
    }
  }, [description, id, isEdit, slug, title, validate]);

  const goToAddQuestion = useCallback(() => {
    if (!isEdit) return;
    router.push({
      pathname: "/classic-quiz/edit-question",
      params: { quizId: String(id) },
    });
  }, [id, isEdit]);

  const goToEditQuestion = useCallback(
    (questionId: string) => {
      router.push({
        pathname: "/classic-quiz/edit-question",
        params: { quizId: String(id), questionId },
      });
    },
    [id]
  );

  const onDeleteQuestion = useCallback(
    (q: Question) => {
      Alert.alert(
        "Delete question?",
        "This will permanently delete the question and its options.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete",
            style: "destructive",
            onPress: async () => {
              try {
                await deleteQuestion(q.id);
                await loadQuestions(String(id));
              } catch (e: any) {
                Alert.alert("Delete failed", e?.message ?? "Could not delete question.");
              }
            },
          },
        ]
      );
    },
    [id, loadQuestions]
  );

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      {/* Header */}
      <View
        style={{
          padding: 16,
          borderBottomWidth: 1,
          borderBottomColor: theme.colors.border,
          backgroundColor: theme.colors.bg,
        }}
      >
        <Text style={{ fontSize: 20, fontWeight: "800" }}>
          {isEdit ? "Edit quiz" : "Add new quiz"}
        </Text>
        <Text style={{ color: theme.colors.muted, marginTop: 4 }}>
          Admin Mode is ON — changes are saved locally.
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        {err && <ErrorBanner message={err} />}

        <View style={{ gap: 6 }}>
          <Text style={{ fontWeight: "700" }}>Title</Text>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="e.g. Email Red Flags"
            placeholderTextColor={theme.colors.muted}
            style={ui.input}
          />
        </View>

        <View style={{ gap: 6 }}>
          <Text style={{ fontWeight: "700" }}>Description</Text>
          <TextInput
            value={description}
            onChangeText={setDescription}
            placeholder="One-line description"
            placeholderTextColor={theme.colors.muted}
            style={ui.input}
          />
        </View>

        <View style={{ gap: 6 }}>
          <Text style={{ fontWeight: "700" }}>Slug (optional)</Text>
          <TextInput
            value={slug}
            onChangeText={setSlug}
            placeholder="Auto-generated from title if empty"
            placeholderTextColor={theme.colors.muted}
            style={ui.input}
          />
          <Text style={{ color: theme.colors.muted, fontSize: 12 }}>
            Leave empty to auto-generate a unique slug.
          </Text>
        </View>

        {/* Questions section only after quiz exists */}
        {isEdit && (
          <View
            style={{
              ...ui.card,
              marginTop: 6,
              padding: 12,
              gap: 10,
            }}
          >
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={{ fontWeight: "800", fontSize: 16 }}>Questions</Text>

              <Pressable
                onPress={goToAddQuestion}
                style={({ pressed }) => ({
                  ...ui.button,
                  backgroundColor: pressed ? theme.colors.cardPressed : theme.colors.surface1,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                  paddingVertical: 8,
                  paddingHorizontal: 10,
                })}
              >
                <Ionicons name="add" size={18} />
                <Text style={{ fontWeight: "700" }}>Add</Text>
              </Pressable>
            </View>

            <View style={{ height: 1, backgroundColor: theme.colors.border }} />

            {qLoading ? (
              <ActivityIndicator />
            ) : questions.length === 0 ? (
              <Text style={{ color: theme.colors.muted }}>
                No questions yet. Tap Add to create the first one.
              </Text>
            ) : (
              questions.map((qq) => (
                <View
                  key={qq.id}
                  style={{
                    ...ui.card,
                    borderWidth: 1,
                    padding: 10,
                    gap: 8,
                  }}
                >
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                    <Text style={{ fontWeight: "800", flex: 1 }}>
                      {qq.order}. {(qq.text ?? "").slice(0, 80)}
                      {(qq.text ?? "").length > 80 ? "…" : ""}
                    </Text>

                    <View style={{ flexDirection: "row", gap: 8 }}>
                      <Pressable
                        onPress={() => goToEditQuestion(qq.id)}
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
                        onPress={() => onDeleteQuestion(qq)}
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
                  </View>
                </View>
              ))
            )}
          </View>
        )}
      </ScrollView>

      {/* Footer */}
      <View
        style={{
          padding: 16,
          borderTopWidth: 1,
          borderTopColor: theme.colors.border,
          flexDirection: "row",
          gap: 10,
          backgroundColor: theme.colors.bg,
        }}
      >
        <Pressable
          onPress={() => router.back()}
          disabled={saving}
          style={({ pressed }) => ({
            ...ui.button,
            opacity: pressed ? 0.8 : 1,
            flex: 1,
            padding: 14,
          })}
        >
          <Text style={{ fontWeight: "700" }}>Back</Text>
        </Pressable>

        <Pressable
          onPress={onSave}
          disabled={saving}
          style={({ pressed }) => ({
            ...ui.button,
            opacity: saving ? 0.6 : pressed ? 0.85 : 1,
            flex: 1,
            padding: 14,
          })}
        >
          <Text style={{ fontWeight: "800" }}>{saving ? "Saving..." : "Save quiz"}</Text>
        </Pressable>
      </View>
    </View>
  );
}


