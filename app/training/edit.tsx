import { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ActivityIndicator,
  ScrollView,
  Alert,
  Image,
  Switch,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { theme } from "../../src/theme";
import { ui } from "../../src/ui";
import { ErrorBanner } from "../../src/Feedback";
import { useAuth } from "../../src/auth/AuthProvider";
import { useRole } from "../../src/auth/useRole";
import {
  createLessonWithBlocks,
  getLessonBlocks,
  getLessonById,
  updateLessonWithBlocks,
  type LessonBlockInput,
} from "../../src/repos/lessons";
import {
  getTrainingBlockImageSource,
  TRAINING_BLOCK_IMAGE_EXAMPLES,
} from "../../src/trainingBlockImages";
import type {
  TrainingBlockType,
  TrainingBlockWithOptions,
} from "../../src/types/models";

type DraftOption = {
  localId: string;
  label: string;
  isCorrect: boolean;
};

type DraftBlock = {
  localId: string;
  type: TrainingBlockType;
  title: string;
  body: string;
  isRequired: boolean;
  options: DraftOption[];
};

const blockTypeOptions: Array<{
  type: TrainingBlockType;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
}> = [
  { type: "text", label: "Text", icon: "document-text-outline" },
  { type: "question_single", label: "Checkpoint", icon: "help-circle-outline" },
  { type: "image", label: "Image", icon: "image-outline" },
];

function makeLocalId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function createDraftOption(label = "", isCorrect = false): DraftOption {
  return {
    localId: makeLocalId("option"),
    label,
    isCorrect,
  };
}

function createDraftBlock(type: TrainingBlockType): DraftBlock {
  if (type === "question_single") {
    return {
      localId: makeLocalId("block"),
      type,
      title: "Checkpoint",
      body: "",
      isRequired: true,
      options: [
        createDraftOption("", true),
        createDraftOption(""),
        createDraftOption(""),
      ],
    };
  }

  if (type === "image") {
    return {
      localId: makeLocalId("block"),
      type,
      title: "Example",
      body: TRAINING_BLOCK_IMAGE_EXAMPLES[0]?.key ?? "",
      isRequired: true,
      options: [],
    };
  }

  return {
    localId: makeLocalId("block"),
    type,
    title: "Learning step",
    body: "",
    isRequired: true,
    options: [],
  };
}

function draftFromStoredBlock(block: TrainingBlockWithOptions): DraftBlock {
  const fallback = createDraftBlock(block.type);

  return {
    localId: makeLocalId("block"),
    type: block.type,
    title: block.title ?? fallback.title,
    body: block.body ?? "",
    isRequired: block.isRequired === 1,
    options:
      block.type === "question_single"
        ? block.options.map((option) =>
            createDraftOption(option.label, option.isCorrect === 1)
          )
        : [],
  };
}

function buildBlocksFromLegacyContent(content?: string | null): DraftBlock[] {
  const body = content?.trim();
  if (!body) return [createDraftBlock("text")];

  return [
    {
      ...createDraftBlock("text"),
      title: "Learning step",
      body,
    },
  ];
}

function toLessonBlockInput(block: DraftBlock): LessonBlockInput {
  return {
    type: block.type,
    title: block.title.trim() || null,
    body: block.body.trim() || null,
    isRequired: block.isRequired,
    options:
      block.type === "question_single"
        ? block.options.map((option) => ({
            label: option.label.trim(),
            isCorrect: option.isCorrect,
          }))
        : [],
  };
}

export default function TrainingEdit() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const router = useRouter();

  const { user, adminMode } = useAuth();
  const { role } = useRole();

  const isAdminUi = role === "ADMIN" && adminMode;
  const isEdit = useMemo(() => !!id && String(id).length > 0, [id]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [orderText, setOrderText] = useState("");
  const [blocks, setBlocks] = useState<DraftBlock[]>([createDraftBlock("text")]);

  const load = useCallback(async () => {
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
        setTitle("");
        setSummary("");
        setOrderText("");
        setBlocks([createDraftBlock("text")]);
        return;
      }

      const lessonId = String(id);
      const [lesson, lessonBlocks] = await Promise.all([
        getLessonById(lessonId),
        getLessonBlocks(lessonId),
      ]);

      if (!lesson) {
        setErr("Lesson not found.");
        return;
      }

      setTitle(lesson.title ?? "");
      setSummary(lesson.summary ?? "");
      setOrderText(
        typeof lesson.order === "number" && Number.isFinite(lesson.order)
          ? String(lesson.order)
          : ""
      );
      setBlocks(
        lessonBlocks.length > 0
          ? lessonBlocks.map(draftFromStoredBlock)
          : buildBlocksFromLegacyContent(lesson.content)
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

  const updateBlock = useCallback(
    (localId: string, patch: Partial<DraftBlock>) => {
      setBlocks((prev) =>
        prev.map((block) =>
          block.localId === localId ? { ...block, ...patch } : block
        )
      );
    },
    []
  );

  const changeBlockType = useCallback(
    (localId: string, type: TrainingBlockType) => {
      setBlocks((prev) =>
        prev.map((block) => {
          if (block.localId !== localId || block.type === type) return block;
          const replacement = createDraftBlock(type);
          return {
            ...replacement,
            localId: block.localId,
            title: block.title || replacement.title,
            body: type === "question_single" ? block.body : replacement.body || block.body,
          };
        })
      );
    },
    []
  );

  const addBlock = useCallback((type: TrainingBlockType) => {
    setBlocks((prev) => [...prev, createDraftBlock(type)]);
  }, []);

  const removeBlock = useCallback((localId: string) => {
    setBlocks((prev) => prev.filter((block) => block.localId !== localId));
  }, []);

  const moveBlock = useCallback((localId: string, direction: -1 | 1) => {
    setBlocks((prev) => {
      const index = prev.findIndex((block) => block.localId === localId);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= prev.length) {
        return prev;
      }

      const next = [...prev];
      const [item] = next.splice(index, 1);
      next.splice(nextIndex, 0, item);
      return next;
    });
  }, []);

  const updateOption = useCallback(
    (blockId: string, optionId: string, patch: Partial<DraftOption>) => {
      setBlocks((prev) =>
        prev.map((block) => {
          if (block.localId !== blockId) return block;
          return {
            ...block,
            options: block.options.map((option) =>
              option.localId === optionId ? { ...option, ...patch } : option
            ),
          };
        })
      );
    },
    []
  );

  const markCorrectOption = useCallback((blockId: string, optionId: string) => {
    setBlocks((prev) =>
      prev.map((block) => {
        if (block.localId !== blockId) return block;
        return {
          ...block,
          options: block.options.map((option) => ({
            ...option,
            isCorrect: option.localId === optionId,
          })),
        };
      })
    );
  }, []);

  const addOption = useCallback((blockId: string) => {
    setBlocks((prev) =>
      prev.map((block) =>
        block.localId === blockId
          ? { ...block, options: [...block.options, createDraftOption()] }
          : block
      )
    );
  }, []);

  const removeOption = useCallback((blockId: string, optionId: string) => {
    setBlocks((prev) =>
      prev.map((block) => {
        if (block.localId !== blockId) return block;

        const nextOptions = block.options.filter(
          (option) => option.localId !== optionId
        );
        if (!nextOptions.some((option) => option.isCorrect) && nextOptions[0]) {
          nextOptions[0] = { ...nextOptions[0], isCorrect: true };
        }

        return { ...block, options: nextOptions };
      })
    );
  }, []);

  const validate = useCallback((): string | null => {
    if (!title.trim()) return "Title is required.";
    if (!summary.trim()) return "Summary is required.";

    if (orderText.trim()) {
      const n = Number(orderText);
      if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) {
        return "Order must be a positive integer (or leave empty).";
      }
    }

    if (!blocks.length) return "Add at least one block.";
    if (!blocks.some((block) => block.isRequired)) {
      return "At least one block must be required so the lesson can be completed.";
    }

    for (const [index, block] of blocks.entries()) {
      const label = `Block ${index + 1}`;

      if (block.type === "text" && !block.body.trim()) {
        return `${label}: text body is required.`;
      }

      if (block.type === "image") {
        if (!block.body.trim()) {
          return `${label}: image source is required.`;
        }
        if (!getTrainingBlockImageSource(block.body)) {
          return `${label}: use a built-in image example or a valid http/file/data image URL.`;
        }
      }

      if (block.type === "question_single") {
        if (!block.body.trim()) {
          return `${label}: question text is required.`;
        }

        const filledOptions = block.options.filter((option) =>
          option.label.trim()
        );
        if (filledOptions.length < 2) {
          return `${label}: add at least two answer options.`;
        }
        if (filledOptions.filter((option) => option.isCorrect).length !== 1) {
          return `${label}: exactly one answer must be marked correct.`;
        }
      }
    }

    return null;
  }, [blocks, orderText, summary, title]);

  const onSave = useCallback(async () => {
    const validationError = validate();
    if (validationError) {
      Alert.alert("Fix the form", validationError);
      return;
    }

    try {
      setErr(null);
      setSaving(true);

      const order =
        orderText.trim().length > 0 ? Number(orderText.trim()) : undefined;
      const blockPayload = blocks.map(toLessonBlockInput);

      if (isEdit) {
        await updateLessonWithBlocks(String(id), {
          title: title.trim(),
          summary: summary.trim(),
          order,
          blocks: blockPayload,
        });
      } else {
        await createLessonWithBlocks({
          title: title.trim(),
          summary: summary.trim(),
          order,
          blocks: blockPayload,
        });
      }

      router.back();
    } catch (e: any) {
      setErr(e?.message ?? "Failed to save training.");
    } finally {
      setSaving(false);
    }
  }, [blocks, id, isEdit, orderText, router, summary, title, validate]);

  const renderBlock = (block: DraftBlock, index: number) => {
    const imageSource =
      block.type === "image" ? getTrainingBlockImageSource(block.body) : null;

    return (
      <View
        key={block.localId}
        style={{
          ...ui.cardElevated,
          padding: 14,
          gap: 12,
          backgroundColor: theme.colors.surface1,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
          }}
        >
          <Text style={{ fontSize: 16, fontWeight: "800", color: theme.colors.text }}>
            Block {index + 1}
          </Text>

          <View style={{ flexDirection: "row", gap: 8 }}>
            <Pressable
              onPress={() => moveBlock(block.localId, -1)}
              disabled={index === 0 || saving}
              hitSlop={8}
              style={({ pressed }) => ({
                ...ui.button,
                padding: 8,
                opacity: index === 0 || saving ? 0.45 : pressed ? 0.75 : 1,
              })}
            >
              <Ionicons name="chevron-up" size={16} color={theme.colors.text} />
            </Pressable>
            <Pressable
              onPress={() => moveBlock(block.localId, 1)}
              disabled={index === blocks.length - 1 || saving}
              hitSlop={8}
              style={({ pressed }) => ({
                ...ui.button,
                padding: 8,
                opacity:
                  index === blocks.length - 1 || saving ? 0.45 : pressed ? 0.75 : 1,
              })}
            >
              <Ionicons name="chevron-down" size={16} color={theme.colors.text} />
            </Pressable>
            <Pressable
              onPress={() => removeBlock(block.localId)}
              disabled={saving}
              hitSlop={8}
              style={({ pressed }) => ({
                ...ui.button,
                padding: 8,
                opacity: saving ? 0.45 : pressed ? 0.75 : 1,
              })}
            >
              <Ionicons name="trash-outline" size={16} color={theme.colors.error} />
            </Pressable>
          </View>
        </View>

        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {blockTypeOptions.map((option) => {
            const selected = option.type === block.type;
            return (
              <Pressable
                key={option.type}
                onPress={() => changeBlockType(block.localId, option.type)}
                disabled={saving}
                style={({ pressed }) => ({
                  ...ui.chip,
                  opacity: saving ? 0.65 : pressed ? 0.85 : 1,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                  borderColor: selected ? theme.colors.primary : theme.colors.border,
                  backgroundColor: selected ? theme.colors.primaryMuted : theme.colors.surface2,
                })}
              >
                <Ionicons
                  name={option.icon}
                  size={15}
                  color={selected ? theme.colors.primary : theme.colors.muted}
                />
                <Text
                  style={{
                    color: selected ? theme.colors.primary : theme.colors.text,
                    fontWeight: "700",
                  }}
                >
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
          }}
        >
          <View style={{ flex: 1 }}>
            <Text style={{ fontWeight: "700", color: theme.colors.text }}>
              Required for completion
            </Text>
            <Text style={{ color: theme.colors.muted, fontSize: 12, marginTop: 2 }}>
              Optional blocks are shown but do not affect progress.
            </Text>
          </View>
          <Switch
            value={block.isRequired}
            onValueChange={(value) => updateBlock(block.localId, { isRequired: value })}
            disabled={saving}
          />
        </View>

        <View style={{ gap: 6 }}>
          <Text style={{ fontWeight: "700", color: theme.colors.text }}>
            {block.type === "image" ? "Title or caption" : "Title"}
          </Text>
          <TextInput
            value={block.title}
            onChangeText={(value) => updateBlock(block.localId, { title: value })}
            placeholder={block.type === "image" ? "e.g. Fake login example" : "Block title"}
            placeholderTextColor={theme.colors.muted}
            editable={!saving}
            style={ui.input}
          />
        </View>

        {block.type === "text" && (
          <View style={{ gap: 6 }}>
            <Text style={{ fontWeight: "700", color: theme.colors.text }}>Body</Text>
            <TextInput
              value={block.body}
              onChangeText={(value) => updateBlock(block.localId, { body: value })}
              placeholder="Write the lesson content for this step."
              placeholderTextColor={theme.colors.muted}
              editable={!saving}
              multiline
              textAlignVertical="top"
              style={{ ...ui.input, minHeight: 130 }}
            />
          </View>
        )}

        {block.type === "image" && (
          <View style={{ gap: 10 }}>
            <View style={{ gap: 6 }}>
              <Text style={{ fontWeight: "700", color: theme.colors.text }}>
                Image source
              </Text>
              <TextInput
                value={block.body}
                onChangeText={(value) => updateBlock(block.localId, { body: value })}
                placeholder="Built-in key or https:// image URL"
                placeholderTextColor={theme.colors.muted}
                editable={!saving}
                autoCapitalize="none"
                style={ui.input}
              />
            </View>

            <View style={{ gap: 8 }}>
              <Text style={{ fontWeight: "700", color: theme.colors.text }}>
                Built-in examples
              </Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {TRAINING_BLOCK_IMAGE_EXAMPLES.map((example) => {
                  const selected = block.body.trim() === example.key;
                  return (
                    <Pressable
                      key={example.key}
                      onPress={() => updateBlock(block.localId, { body: example.key })}
                      disabled={saving}
                      style={({ pressed }) => ({
                        ...ui.chip,
                        opacity: saving ? 0.65 : pressed ? 0.85 : 1,
                        borderColor: selected ? theme.colors.primary : theme.colors.border,
                        backgroundColor: selected
                          ? theme.colors.primaryMuted
                          : theme.colors.surface2,
                      })}
                    >
                      <Text
                        style={{
                          color: selected ? theme.colors.primary : theme.colors.text,
                          fontWeight: "700",
                        }}
                      >
                        {example.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {imageSource ? (
              <Image
                source={imageSource}
                resizeMode="contain"
                style={{
                  width: "100%",
                  height: 180,
                  borderRadius: theme.radius,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                  backgroundColor: theme.colors.surface2,
                }}
              />
            ) : (
              <View style={ui.mutedPanel}>
                <Text style={{ color: theme.colors.muted }}>
                  No preview. Choose a built-in example or enter a valid image URL.
                </Text>
              </View>
            )}
          </View>
        )}

        {block.type === "question_single" && (
          <View style={{ gap: 10 }}>
            <View style={{ gap: 6 }}>
              <Text style={{ fontWeight: "700", color: theme.colors.text }}>
                Question
              </Text>
              <TextInput
                value={block.body}
                onChangeText={(value) => updateBlock(block.localId, { body: value })}
                placeholder="Write the checkpoint question."
                placeholderTextColor={theme.colors.muted}
                editable={!saving}
                multiline
                textAlignVertical="top"
                style={{ ...ui.input, minHeight: 90 }}
              />
            </View>

            <View style={{ gap: 8 }}>
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 12,
                }}
              >
                <Text style={{ fontWeight: "700", color: theme.colors.text }}>
                  Answers
                </Text>
                <Pressable
                  onPress={() => addOption(block.localId)}
                  disabled={saving}
                  style={({ pressed }) => ({
                    ...ui.button,
                    paddingVertical: 8,
                    paddingHorizontal: 10,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 6,
                    opacity: saving ? 0.6 : pressed ? 0.85 : 1,
                  })}
                >
                  <Ionicons name="add" size={16} color={theme.colors.text} />
                  <Text style={{ fontWeight: "700", color: theme.colors.text }}>
                    Add answer
                  </Text>
                </Pressable>
              </View>

              {block.options.map((option, optionIndex) => (
                <View
                  key={option.localId}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <Pressable
                    onPress={() => markCorrectOption(block.localId, option.localId)}
                    disabled={saving}
                    hitSlop={8}
                    style={({ pressed }) => ({
                      opacity: saving ? 0.6 : pressed ? 0.75 : 1,
                      width: 36,
                      height: 36,
                      borderRadius: 999,
                      alignItems: "center",
                      justifyContent: "center",
                      borderWidth: 1,
                      borderColor: option.isCorrect
                        ? theme.colors.success
                        : theme.colors.borderStrong,
                      backgroundColor: option.isCorrect
                        ? theme.colors.successBg
                        : theme.colors.surface2,
                    })}
                  >
                    <Ionicons
                      name={option.isCorrect ? "radio-button-on" : "radio-button-off"}
                      size={18}
                      color={option.isCorrect ? theme.colors.success : theme.colors.muted}
                    />
                  </Pressable>

                  <TextInput
                    value={option.label}
                    onChangeText={(value) =>
                      updateOption(block.localId, option.localId, { label: value })
                    }
                    placeholder={`Answer ${optionIndex + 1}`}
                    placeholderTextColor={theme.colors.muted}
                    editable={!saving}
                    style={{ ...ui.input, flex: 1 }}
                  />

                  <Pressable
                    onPress={() => removeOption(block.localId, option.localId)}
                    disabled={saving || block.options.length <= 2}
                    hitSlop={8}
                    style={({ pressed }) => ({
                      ...ui.button,
                      padding: 8,
                      opacity:
                        saving || block.options.length <= 2 ? 0.45 : pressed ? 0.75 : 1,
                    })}
                  >
                    <Ionicons
                      name="trash-outline"
                      size={16}
                      color={theme.colors.error}
                    />
                  </Pressable>
                </View>
              ))}
            </View>
          </View>
        )}
      </View>
    );
  };

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <View
        style={{
          padding: 16,
          borderBottomWidth: 1,
          borderBottomColor: theme.colors.border,
          backgroundColor: theme.colors.bg,
        }}
      >
        <Text style={{ fontSize: 20, fontWeight: "800", color: theme.colors.text }}>
          {isEdit ? "Edit training" : "Add new training"}
        </Text>
        <Text style={{ color: theme.colors.muted, marginTop: 4 }}>
          Admin Mode is ON. Edit the block-based training flow.
        </Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }}>
        {err && <ErrorBanner message={err} />}

        <View style={{ ...ui.card, padding: 14, gap: 12 }}>
          <Text style={{ fontSize: 16, fontWeight: "800", color: theme.colors.text }}>
            Training details
          </Text>

          <View style={{ gap: 6 }}>
            <Text style={{ fontWeight: "700", color: theme.colors.text }}>Title</Text>
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="e.g. Email spoofing basics"
              placeholderTextColor={theme.colors.muted}
              editable={!saving}
              style={ui.input}
            />
          </View>

          <View style={{ gap: 6 }}>
            <Text style={{ fontWeight: "700", color: theme.colors.text }}>
              Summary
            </Text>
            <TextInput
              value={summary}
              onChangeText={setSummary}
              placeholder="Short 1-2 line description"
              placeholderTextColor={theme.colors.muted}
              editable={!saving}
              multiline
              style={ui.input}
            />
          </View>

          <View style={{ gap: 6 }}>
            <Text style={{ fontWeight: "700", color: theme.colors.text }}>
              Order (optional)
            </Text>
            <TextInput
              value={orderText}
              onChangeText={setOrderText}
              keyboardType="number-pad"
              placeholder="Leave empty to auto place last"
              placeholderTextColor={theme.colors.muted}
              editable={!saving}
              style={ui.input}
            />
          </View>
        </View>

        <View style={{ gap: 10 }}>
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 12,
            }}
          >
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 16, fontWeight: "800", color: theme.colors.text }}>
                Blocks
              </Text>
              <Text style={{ color: theme.colors.muted, marginTop: 2 }}>
                Build the learner flow from text, checkpoints, and image examples.
              </Text>
            </View>
          </View>

          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {blockTypeOptions.map((option) => (
              <Pressable
                key={option.type}
                onPress={() => addBlock(option.type)}
                disabled={saving}
                style={({ pressed }) => ({
                  ...ui.button,
                  paddingVertical: 10,
                  paddingHorizontal: 12,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 7,
                  opacity: saving ? 0.6 : pressed ? 0.85 : 1,
                })}
              >
                <Ionicons name={option.icon} size={17} color={theme.colors.text} />
                <Text style={{ fontWeight: "700", color: theme.colors.text }}>
                  Add {option.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {blocks.length > 0 ? (
          blocks.map(renderBlock)
        ) : (
          <View style={ui.mutedPanel}>
            <Text style={{ color: theme.colors.muted }}>
              No blocks yet. Add a text, checkpoint, or image block.
            </Text>
          </View>
        )}
      </ScrollView>

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
            opacity: saving ? 0.6 : pressed ? 0.8 : 1,
            flex: 1,
            padding: 14,
          })}
        >
          <Text style={{ fontWeight: "700", color: theme.colors.text }}>Cancel</Text>
        </Pressable>

        <Pressable
          onPress={onSave}
          disabled={saving}
          style={({ pressed }) => ({
            ...ui.buttonPrimary,
            opacity: saving ? 0.6 : pressed ? 0.85 : 1,
            flex: 1,
            padding: 14,
          })}
        >
          <Text style={{ fontWeight: "800", color: theme.colors.textInverse }}>
            {saving ? "Saving..." : "Save"}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
