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
import { Ionicons } from "@expo/vector-icons";

import { theme } from "../../src/theme";
import { ErrorBanner } from "../../src/Feedback";
import { useAuth } from "../../src/auth/AuthProvider";
import { useRole } from "../../src/auth/useRole";

import {
  createQuestion,
  getQuestionById,
  getOptionsForQuestion,
  replaceOptions,
  updateQuestion,
} from "../../src/repos/quiz";

type OptState = {
  key: string; // local key
  text: string;
  isCorrect: boolean;
};

export default function ClassicQuizEditQuestion() {
  const { quizId, questionId } = useLocalSearchParams<{
    quizId: string;
    questionId?: string;
  }>();

  const { user, adminMode } = useAuth();
  const { role } = useRole();
  const isAdminUi = role === "ADMIN" && adminMode;

  const isEdit = useMemo(
    () => !!questionId && String(questionId).length > 0,
    [questionId]
  );

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [text, setText] = useState("");
  const [explanation, setExplanation] = useState("");
  const [orderText, setOrderText] = useState("");

  const [options, setOptions] = useState<OptState[]>([
    { key: "o1", text: "", isCorrect: true },
    { key: "o2", text: "", isCorrect: false },
    { key: "o3", text: "", isCorrect: false },
    { key: "o4", text: "", isCorrect: false },
  ]);

  const load = useCallback(async () => {
    if (!user?.id) {
      setErr("Not signed in.");
      setLoading(false);
      return;
    }
    if (!isAdminUi) {
      setErr("Admin Mode is required to edit questions.");
      setLoading(false);
      return;
    }

    try {
      setErr(null);
      setLoading(true);

      if (!isEdit) {
        // create mode
        setText("");
        setExplanation("");
        setOrderText("");
        setOptions([
          { key: "o1", text: "", isCorrect: true },
          { key: "o2", text: "", isCorrect: false },
          { key: "o3", text: "", isCorrect: false },
          { key: "o4", text: "", isCorrect: false },
        ]);
        return;
      }

      const qid = String(questionId);
      const q = await getQuestionById(qid);
      if (!q) {
        setErr("Question not found.");
        return;
      }

      setText(q.text ?? "");
      setExplanation(q.explanation ?? "");
      setOrderText(typeof q.order === "number" ? String(q.order) : "");

      const opts = await getOptionsForQuestion(qid);
      const mapped: OptState[] = (opts ?? []).map((o, idx) => ({
        key: `${o.id}-${idx}`,
        text: o.text ?? "",
        isCorrect: !!o.isCorrect,
      }));

      // ensure at least 2 options in UI
      if (mapped.length < 2) {
        mapped.push({ key: "extra1", text: "", isCorrect: false });
      }

      // if none marked correct (bad data), force first
      if (!mapped.some((x) => x.isCorrect) && mapped.length > 0) {
        mapped[0].isCorrect = true;
      }

      setOptions(mapped);
    } catch (e: any) {
      setErr(e?.message ?? "Failed to load question.");
    } finally {
      setLoading(false);
    }
  }, [isAdminUi, isEdit, questionId, user?.id]);

  useEffect(() => {
    load();
  }, [load]);

  const setCorrect = useCallback((key: string) => {
    setOptions((prev) =>
      prev.map((o) => ({ ...o, isCorrect: o.key === key }))
    );
  }, []);

  const updateOptText = useCallback((key: string, value: string) => {
    setOptions((prev) =>
      prev.map((o) => (o.key === key ? { ...o, text: value } : o))
    );
  }, []);

  const addOption = useCallback(() => {
    setOptions((prev) => {
      if (prev.length >= 6) return prev;
      return [
        ...prev,
        { key: `o${Date.now()}`, text: "", isCorrect: false },
      ];
    });
  }, []);

  const removeOption = useCallback((key: string) => {
    setOptions((prev) => {
      if (prev.length <= 2) return prev;
      const next = prev.filter((o) => o.key !== key);

      // if removed was correct, make first correct
      if (!next.some((x) => x.isCorrect) && next.length > 0) {
        next[0] = { ...next[0], isCorrect: true };
      }
      return next;
    });
  }, []);

  const validate = useCallback((): string | null => {
    if (!String(quizId || "").trim()) return "Missing quizId.";
    if (!text.trim()) return "Question text is required.";

    const clean = options
      .map((o) => ({ ...o, text: o.text.trim() }))
      .filter((o) => o.text.length > 0);

    if (clean.length < 2) return "Add at least 2 non-empty options.";
    if (clean.filter((o) => o.isCorrect).length !== 1)
      return "Select exactly 1 correct option.";

    if (orderText.trim()) {
      const n = Number(orderText);
      if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) {
        return "Order must be a positive integer (or leave empty).";
      }
    }

    return null;
  }, [options, orderText, quizId, text]);

  const onSave = useCallback(async () => {
    const v = validate();
    if (v) {
      Alert.alert("Fix the form", v);
      return;
    }

    try {
      setErr(null);
      setSaving(true);

      const cleanOptions = options
        .map((o) => ({ text: o.text.trim(), isCorrect: o.isCorrect }))
        .filter((o) => o.text.length > 0);

      const order =
        orderText.trim().length > 0 ? Number(orderText.trim()) : undefined;

      let qid: string;

      if (isEdit) {
        qid = String(questionId);
        await updateQuestion(qid, {
          text: text.trim(),
          explanation: explanation.trim() || null,
          order,
        });
      } else {
        const created = await createQuestion({
          quizId: String(quizId),
          text: text.trim(),
          explanation: explanation.trim() || null,
          order,
        });
        qid = created.id;
      }

      await replaceOptions(qid, cleanOptions);

      router.back();
    } catch (e: any) {
      setErr(e?.message ?? "Failed to save question.");
    } finally {
      setSaving(false);
    }
  }, [explanation, isEdit, options, orderText, questionId, quizId, text, validate]);

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
          {isEdit ? "Edit question" : "Add question"}
        </Text>
        <Text style={{ color: theme.colors.muted, marginTop: 4 }}>
          Choose the correct option (exactly one).
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        {err && <ErrorBanner message={err} />}

        <View style={{ gap: 6 }}>
          <Text style={{ fontWeight: "700" }}>Question</Text>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="Write the question..."
            placeholderTextColor="#6b7280"
            multiline
            style={{
              borderWidth: 1,
              borderColor: theme.colors.border,
              borderRadius: theme.radius,
              padding: 12,
              backgroundColor: "white",
              minHeight: 90,
              textAlignVertical: "top",
            }}
          />
        </View>

        <View style={{ gap: 6 }}>
          <Text style={{ fontWeight: "700" }}>Explanation (optional)</Text>
          <TextInput
            value={explanation}
            onChangeText={setExplanation}
            placeholder="Shown after the answer"
            placeholderTextColor="#6b7280"
            multiline
            style={{
              borderWidth: 1,
              borderColor: theme.colors.border,
              borderRadius: theme.radius,
              padding: 12,
              backgroundColor: "white",
              minHeight: 70,
              textAlignVertical: "top",
            }}
          />
        </View>

        <View style={{ gap: 6 }}>
          <Text style={{ fontWeight: "700" }}>Order (optional)</Text>
          <TextInput
            value={orderText}
            onChangeText={setOrderText}
            keyboardType="number-pad"
            placeholder="Leave empty for auto"
            placeholderTextColor="#6b7280"
            style={{
              borderWidth: 1,
              borderColor: theme.colors.border,
              borderRadius: theme.radius,
              padding: 12,
              backgroundColor: "white",
            }}
          />
        </View>

        <View
          style={{
            borderWidth: 1,
            borderColor: theme.colors.border,
            borderRadius: theme.radius,
            padding: 12,
            backgroundColor: theme.colors.card,
            gap: 10,
          }}
        >
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Text style={{ fontWeight: "800", fontSize: 16 }}>Options</Text>

            <Pressable
              onPress={addOption}
              style={({ pressed }) => ({
                opacity: pressed ? 0.85 : 1,
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
                borderWidth: 1,
                borderColor: theme.colors.border,
                borderRadius: theme.radius,
                paddingVertical: 8,
                paddingHorizontal: 10,
                backgroundColor: "white",
              })}
            >
              <Ionicons name="add" size={18} />
              <Text style={{ fontWeight: "700" }}>Add option</Text>
            </Pressable>
          </View>

          <View style={{ height: 1, backgroundColor: theme.colors.border }} />

          {options.map((o, idx) => (
            <View
              key={o.key}
              style={{
                borderWidth: 1,
                borderColor: theme.colors.border,
                borderRadius: theme.radius,
                padding: 10,
                backgroundColor: "white",
                gap: 8,
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <Pressable
                  onPress={() => setCorrect(o.key)}
                  hitSlop={10}
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 999,
                    borderWidth: 2,
                    borderColor: theme.colors.border,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                  accessibilityLabel={`Mark option ${idx + 1} as correct`}
                >
                  {o.isCorrect ? (
                    <View
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: 999,
                        backgroundColor: theme.colors.text,
                      }}
                    />
                  ) : null}
                </Pressable>

                <Text style={{ fontWeight: "800" }}>{idx + 1}.</Text>

                <View style={{ flex: 1 }}>
                  <TextInput
                    value={o.text}
                    onChangeText={(v) => updateOptText(o.key, v)}
                    placeholder="Option text..."
                    placeholderTextColor="#6b7280"
                    style={{
                      borderWidth: 1,
                      borderColor: theme.colors.border,
                      borderRadius: theme.radius,
                      padding: 10,
                      backgroundColor: "white",
                    }}
                  />
                </View>

                <Pressable
                  onPress={() => removeOption(o.key)}
                  hitSlop={10}
                  style={({ pressed }) => ({
                    opacity: pressed ? 0.7 : 1,
                    padding: 6,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: theme.colors.border,
                    backgroundColor: "white",
                  })}
                  accessibilityLabel={`Remove option ${idx + 1}`}
                >
                  <Ionicons name="trash" size={16} />
                </Pressable>
              </View>
            </View>
          ))}

          <Text style={{ color: theme.colors.muted, fontSize: 12 }}>
            Need at least 2 options. Exactly 1 must be marked correct.
          </Text>
        </View>
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
            opacity: pressed ? 0.8 : 1,
            flex: 1,
            borderWidth: 1,
            borderColor: theme.colors.border,
            borderRadius: theme.radius,
            padding: 14,
            alignItems: "center",
            backgroundColor: "white",
          })}
        >
          <Text style={{ fontWeight: "700" }}>Cancel</Text>
        </Pressable>

        <Pressable
          onPress={onSave}
          disabled={saving}
          style={({ pressed }) => ({
            opacity: saving ? 0.6 : pressed ? 0.85 : 1,
            flex: 1,
            borderWidth: 1,
            borderColor: theme.colors.border,
            borderRadius: theme.radius,
            padding: 14,
            alignItems: "center",
            backgroundColor: "white",
          })}
        >
          <Text style={{ fontWeight: "800" }}>
            {saving ? "Saving..." : "Save"}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
