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

// DB
import {
  createLesson,
  getLessonById,
  updateLesson,
} from "../../src/repos/lessons";
import type { Lesson } from "../../src/types/models";

export default function TrainingEdit() {
  const { id } = useLocalSearchParams<{ id?: string }>();

  const { user, adminMode } = useAuth();
  const { role } = useRole();

  const isAdminUi = role === "ADMIN" && adminMode;
  const isEdit = useMemo(() => !!id && String(id).length > 0, [id]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [content, setContent] = useState("");
  const [orderText, setOrderText] = useState(""); // optional numeric input

  const load = useCallback(async () => {
    // Security / gating
    if (!user?.id) {
      setErr("Not signed in.");
      setLoading(false);
      return;
    }
    if (!isAdminUi) {
      setErr("Admin Mode is required to edit trainings.");
      setLoading(false);
      return;
    }

    try {
      setErr(null);
      setLoading(true);

      if (!isEdit) {
        // Create mode: empty form
        setTitle("");
        setSummary("");
        setContent("");
        setOrderText("");
        return;
      }

      const lessonId = String(id);
      const l = await getLessonById(lessonId);

      if (!l) {
        setErr("Lesson not found.");
        return;
      }

      setTitle(l.title ?? "");
      setSummary(l.summary ?? "");
      setContent(l.content ?? "");
      setOrderText(
        typeof l.order === "number" && Number.isFinite(l.order) ? String(l.order) : ""
      );
    } catch (e: any) {
      setErr(e?.message ?? "Failed to load training.");
    } finally {
      setLoading(false);
    }
  }, [id, isAdminUi, isEdit, user?.id]);

  useEffect(() => {
    load();
  }, [load]);

  const validate = useCallback((): string | null => {
    if (!title.trim()) return "Title is required.";
    if (!summary.trim()) return "Summary is required.";
    if (!content.trim()) return "Content is required.";

    if (orderText.trim()) {
      const n = Number(orderText);
      if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) {
        return "Order must be a positive integer (or leave empty).";
      }
    }
    return null;
  }, [title, summary, content, orderText]);

  const onSave = useCallback(async () => {
    const v = validate();
    if (v) {
      Alert.alert("Fix the form", v);
      return;
    }

    try {
      setErr(null);
      setSaving(true);

      const order =
        orderText.trim().length > 0 ? Number(orderText.trim()) : undefined;

      if (isEdit) {
        await updateLesson(String(id), {
          title: title.trim(),
          summary: summary.trim(),
          content: content.trim(),
          order,
        });
      } else {
        await createLesson({
          title: title.trim(),
          summary: summary.trim(),
          content: content.trim(),
          order,
        });
      }

      router.back();
    } catch (e: any) {
      setErr(e?.message ?? "Failed to save training.");
    } finally {
      setSaving(false);
    }
  }, [content, id, isEdit, orderText, summary, title, validate]);

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
          {isEdit ? "Edit training" : "Add new training"}
        </Text>
        <Text style={{ color: theme.colors.muted, marginTop: 4 }}>
          Admin Mode is ON — changes are saved locally.
        </Text>
      </View>

      {/* Body */}
      <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
        {err && <ErrorBanner message={err} />}

        <View style={{ gap: 6 }}>
          <Text style={{ fontWeight: "700" }}>Title</Text>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="e.g. Email spoofing basics"
            placeholderTextColor={theme.colors.muted}
            style={ui.input}
          />
        </View>

        <View style={{ gap: 6 }}>
          <Text style={{ fontWeight: "700" }}>Summary</Text>
          <TextInput
            value={summary}
            onChangeText={setSummary}
            placeholder="Short 1–2 lines description"
            placeholderTextColor={theme.colors.muted}
            style={ui.input}
          />
        </View>

        <View style={{ gap: 6 }}>
          <Text style={{ fontWeight: "700" }}>Content</Text>
          <TextInput
            value={content}
            onChangeText={setContent}
            placeholder={"Write lesson text here...\nUse new lines for paragraphs."}
            placeholderTextColor={theme.colors.muted}
            multiline
            textAlignVertical="top"
            style={{
              minHeight: 180,
              ...ui.input,
            }}
          />
        </View>

        <View style={{ gap: 6 }}>
          <Text style={{ fontWeight: "700" }}>Order (optional)</Text>
          <TextInput
            value={orderText}
            onChangeText={setOrderText}
            keyboardType="number-pad"
            placeholder="Leave empty to auto place last"
            placeholderTextColor={theme.colors.muted}
            style={ui.input}
          />
          <Text style={{ color: theme.colors.muted, fontSize: 12 }}>
            Tip: if empty, it will be added after the last training.
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
            ...ui.button,
            opacity: pressed ? 0.8 : 1,
            flex: 1,
            padding: 14,
          })}
        >
          <Text style={{ fontWeight: "700" }}>Cancel</Text>
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
          <Text style={{ fontWeight: "800" }}>
            {saving ? "Saving..." : "Save"}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}


