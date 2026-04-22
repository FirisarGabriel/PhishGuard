import { useLocalSearchParams, router } from "expo-router";
import { View, Text, ScrollView, Pressable, ActivityIndicator } from "react-native";
import { useEffect, useState, useCallback } from "react";
import { ErrorBanner } from "../../src/Feedback";
import ProgressBar from "../../src/ProgressBar";
import { theme } from "../../src/theme";
import { ui } from "../../src/ui";
import { useAuth } from "../../src/auth/AuthProvider";
import { useAchievementToast } from "../../src/achievements/AchievementToastProvider";
import { evaluateTrainingAchievements } from "../../src/repos/achievements";
import {
  completeTextBlock,
  getBlockProgressMap,
  getLessonBlocks,
  getLessonById,
  getProgressMap,
  submitSingleChoiceAnswer,
} from "../../src/repos/lessons";
import type {
  Lesson,
  TrainingBlockProgress,
  TrainingBlockWithOptions,
} from "../../src/types/models";

export default function LessonDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [blocks, setBlocks] = useState<TrainingBlockWithOptions[]>([]);
  const [blockProgress, setBlockProgress] = useState<Record<string, TrainingBlockProgress>>({});
  const [progress, setProgress] = useState(0);
  const [savingBlockId, setSavingBlockId] = useState<string | null>(null);

  const { user } = useAuth();
  const { notifyAchievements } = useAchievementToast();
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
      const [l, b, bpm, pm] = await Promise.all([
        getLessonById(lessonId),
        getLessonBlocks(lessonId),
        getBlockProgressMap(userId, lessonId),
        getProgressMap(userId),
      ]);

      if (!l) {
        setLesson(null);
        setErr("Lesson not found.");
        return;
      }

      setLesson(l);
      setBlocks(b);
      setBlockProgress(bpm);

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

  const refreshProgress = useCallback(async () => {
    if (!userId || !lesson) return;

    const [bpm, pm] = await Promise.all([
      getBlockProgressMap(userId, lesson.id),
      getProgressMap(userId),
    ]);

    setBlockProgress(bpm);
    const p = pm[lesson.id]?.completion ?? 0;
    setProgress(typeof p === "number" ? p : 0);
  }, [lesson, userId]);

  const onMarkTextRead = useCallback(
    async (blockId: string) => {
      if (!userId || !lesson) {
        setErr("Not signed in.");
        return;
      }

      try {
        setSavingBlockId(blockId);
        await completeTextBlock(userId, lesson.id, blockId);
        await refreshProgress();
      } catch (e: any) {
        setErr(e?.message ?? "Failed to save block progress.");
      } finally {
        setSavingBlockId(null);
      }
    },
    [lesson, refreshProgress, userId]
  );

  const onSelectOption = useCallback(
    async (blockId: string, optionId: string) => {
      if (!userId || !lesson) {
        setErr("Not signed in.");
        return;
      }

      try {
        setSavingBlockId(blockId);
        const { isCorrect } = await submitSingleChoiceAnswer(
          userId,
          lesson.id,
          blockId,
          optionId
        );
        await refreshProgress();

        if (isCorrect) {
          const unlocked = await evaluateTrainingAchievements(userId);
          notifyAchievements(unlocked);
        }
      } catch (e: any) {
        setErr(e?.message ?? "Failed to submit answer.");
      } finally {
        setSavingBlockId(null);
      }
    },
    [lesson, notifyAchievements, refreshProgress, userId]
  );

  const completedBlockCount = blocks.filter(
    (block) => blockProgress[block.id]?.status === "completed"
  ).length;
  const remainingBlockCount = Math.max(blocks.length - completedBlockCount, 0);

  if (loading) {
    return (
      <View style={{ ...ui.screen, ...ui.centered }}>
        <ActivityIndicator />
        <Text style={{ marginTop: 12, color: theme.colors.muted }}>
          Loading training flow...
        </Text>
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

  const renderTextBlock = (block: TrainingBlockWithOptions) => {
    const done = blockProgress[block.id]?.status === "completed";
    const busy = savingBlockId === block.id;
    const blockIndex = blocks.findIndex((entry) => entry.id === block.id) + 1;

    return (
      <View
        key={block.id}
        style={{
          ...ui.cardElevated,
          padding: 16,
          marginBottom: 14,
          gap: 12,
          backgroundColor: done ? theme.colors.surface2 : theme.colors.surface1,
          borderColor: done ? theme.colors.success : theme.colors.border,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}>
            <View
              style={{
                width: 34,
                height: 34,
                borderRadius: 999,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: done ? theme.colors.successBg : theme.colors.primaryMuted,
                borderWidth: 1,
                borderColor: done ? theme.colors.success : theme.colors.primary,
              }}
            >
              <Text
                style={{
                  fontWeight: "700",
                  color: done ? theme.colors.success : theme.colors.primary,
                }}
              >
                {blockIndex}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.colors.muted, fontSize: 12, fontWeight: "600" }}>
                LEARNING STEP
              </Text>
              {!!block.title && (
                <Text style={{ fontSize: 18, fontWeight: "700", color: theme.colors.text }}>
                  {block.title}
                </Text>
              )}
            </View>
          </View>

          <View
            style={{
              ...ui.chip,
              backgroundColor: done ? theme.colors.successBg : theme.colors.surface2,
              borderColor: done ? theme.colors.success : theme.colors.border,
            }}
          >
            <Text
              style={{
                color: done ? theme.colors.success : theme.colors.muted,
                fontWeight: "700",
              }}
            >
              {done ? "Done" : "Read"}
            </Text>
          </View>
        </View>

        {(block.body ?? "").split("\n").map((line, idx) => (
          <Text
            key={`${block.id}-line-${idx}`}
            style={{
              fontSize: 16,
              lineHeight: 22,
              color: theme.colors.text,
            }}
          >
            {line}
          </Text>
        ))}

        <Pressable
          disabled={busy || done}
          onPress={() => onMarkTextRead(block.id)}
          style={({ pressed }) => ({
            opacity: pressed || busy || done ? 0.85 : 1,
            borderWidth: 1,
            borderColor: done ? theme.colors.success : theme.colors.primary,
            borderRadius: theme.radiusSm,
            padding: 12,
            alignItems: "center",
            backgroundColor: done ? theme.colors.successBg : theme.colors.primaryMuted,
          })}
        >
          <Text
            style={{
              fontWeight: "700",
              color: done ? theme.colors.success : theme.colors.primary,
            }}
          >
            {done ? "Read ✓" : busy ? "Saving..." : "Mark as read"}
          </Text>
        </Pressable>
      </View>
    );
  };

  const renderSingleChoiceBlock = (block: TrainingBlockWithOptions) => {
    const current = blockProgress[block.id];
    const selectedOptionId = current?.selectedOptionId ?? null;
    const isCorrect = current?.isCorrect === 1;
    const busy = savingBlockId === block.id;
    const blockIndex = blocks.findIndex((entry) => entry.id === block.id) + 1;

    return (
      <View
        key={block.id}
        style={{
          ...ui.cardElevated,
          padding: 16,
          marginBottom: 14,
          gap: 12,
          borderColor: isCorrect ? theme.colors.success : theme.colors.border,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}>
            <View
              style={{
                width: 34,
                height: 34,
                borderRadius: 999,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: isCorrect ? theme.colors.successBg : "#fff4db",
                borderWidth: 1,
                borderColor: isCorrect ? theme.colors.success : theme.colors.warning,
              }}
            >
              <Text
                style={{
                  fontWeight: "700",
                  color: isCorrect ? theme.colors.success : theme.colors.warning,
                }}
              >
                {blockIndex}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.colors.muted, fontSize: 12, fontWeight: "600" }}>
                CHECKPOINT
              </Text>
              {!!block.title && (
                <Text style={{ fontSize: 18, fontWeight: "700", color: theme.colors.text }}>
                  {block.title}
                </Text>
              )}
            </View>
          </View>

          <View
            style={{
              ...ui.chip,
              backgroundColor: isCorrect ? theme.colors.successBg : "#fff4db",
              borderColor: isCorrect ? theme.colors.success : theme.colors.warning,
            }}
          >
            <Text
              style={{
                color: isCorrect ? theme.colors.success : "#9a6700",
                fontWeight: "700",
              }}
            >
              {isCorrect ? "Passed" : "Answer"}
            </Text>
          </View>
        </View>

        {!!block.body && (
          <Text style={{ fontSize: 16, lineHeight: 23, color: theme.colors.text }}>
            {block.body}
          </Text>
        )}

        {block.options.map((opt) => {
          const isSelected = selectedOptionId === opt.id;
          const optionIndex = block.options.findIndex((entry) => entry.id === opt.id);
          return (
            <Pressable
              key={opt.id}
              disabled={busy}
              onPress={() => onSelectOption(block.id, opt.id)}
              style={({ pressed }) => ({
                opacity: pressed || busy ? 0.88 : 1,
                borderWidth: 1,
                borderColor:
                  isSelected && isCorrect
                    ? theme.colors.success
                    : isSelected
                      ? theme.colors.borderStrong
                      : theme.colors.border,
                borderRadius: theme.radiusSm,
                padding: 14,
                backgroundColor:
                  isSelected && isCorrect
                    ? theme.colors.successBg
                    : isSelected
                      ? theme.colors.cardPressed
                      : theme.colors.card,
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
              })}
            >
              <View
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor:
                    isSelected && isCorrect
                      ? theme.colors.success
                      : isSelected
                        ? theme.colors.primary
                        : theme.colors.borderStrong,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor:
                    isSelected && isCorrect
                      ? theme.colors.success
                      : isSelected
                        ? theme.colors.primaryMuted
                        : theme.colors.surface1,
                }}
              >
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: "700",
                    color:
                      isSelected && isCorrect
                        ? theme.colors.textInverse
                        : isSelected
                          ? theme.colors.primary
                          : theme.colors.muted,
                  }}
                >
                  {isSelected ? (isCorrect ? "✓" : "•") : String.fromCharCode(65 + optionIndex)}
                </Text>
              </View>

              <View style={{ flex: 1 }}>
                <Text style={{ color: theme.colors.text, fontWeight: isSelected ? "700" : "500" }}>
                  {opt.label}
                </Text>
              </View>
            </Pressable>
          );
        })}

        {selectedOptionId && (
          <View
            style={{
              borderWidth: 1,
              borderColor: isCorrect ? theme.colors.success : theme.colors.errorBorder,
              borderRadius: theme.radiusSm,
              padding: 12,
              backgroundColor: isCorrect ? theme.colors.successBg : theme.colors.errorBg,
            }}
          >
            <Text
              style={{
                fontWeight: "700",
                color: isCorrect ? theme.colors.success : theme.colors.error,
                marginBottom: 4,
              }}
            >
              {isCorrect ? "Checkpoint passed" : "Checkpoint incomplete"}
            </Text>
            <Text style={{ color: isCorrect ? theme.colors.success : theme.colors.error }}>
              {isCorrect
                ? "Correct answer. Great job."
                : "Not quite. Try again to complete this checkpoint."}
            </Text>
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <View
        style={{
          paddingHorizontal: 16,
          paddingTop: 16,
          paddingBottom: 18,
          borderBottomWidth: 1,
          borderBottomColor: theme.colors.border,
          backgroundColor: theme.colors.surface1,
        }}
      >
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => ({
            alignSelf: "flex-start",
            ...ui.chip,
            opacity: pressed ? 0.8 : 1,
            marginBottom: 14,
          })}
        >
          <Text style={{ color: theme.colors.text, fontWeight: "600" }}>Back</Text>
        </Pressable>

        <Text style={{ color: theme.colors.primary, fontSize: 12, fontWeight: "700" }}>
          PHISHING AWARENESS TRAINING
        </Text>
        <Text style={{ fontSize: 24, fontWeight: "700", color: theme.colors.text, marginTop: 4 }}>
          {lesson.title}
        </Text>
        <Text style={{ color: theme.colors.muted, lineHeight: 21, marginTop: 8 }}>
          {lesson.summary}
        </Text>

        <View style={{ marginTop: 14 }}>
          <ProgressBar value={progress} />
        </View>

        <View style={{ flexDirection: "row", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
          <View
            style={{
              ...ui.chip,
              backgroundColor: theme.colors.primaryMuted,
              borderColor: theme.colors.primary,
            }}
          >
            <Text style={{ color: theme.colors.primary, fontWeight: "700" }}>
              {progress}% complete
            </Text>
          </View>
          <View style={ui.chip}>
            <Text style={{ color: theme.colors.text, fontWeight: "600" }}>
              {completedBlockCount}/{blocks.length} steps done
            </Text>
          </View>
          <View style={ui.chip}>
            <Text style={{ color: theme.colors.text, fontWeight: "600" }}>
              {remainingBlockCount} remaining
            </Text>
          </View>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 28 }}>
        <View
          style={{
            ...ui.screenSection,
            marginBottom: 16,
            backgroundColor: theme.colors.surface2,
            gap: 8,
          }}
        >
          <Text style={{ color: theme.colors.text, fontSize: 16, fontWeight: "700" }}>
            How this lesson works
          </Text>
          <Text style={{ color: theme.colors.muted, lineHeight: 21 }}>
            Read each step, complete every checkpoint, and finish all required blocks to mark this training as done.
          </Text>
        </View>

        {blocks.map((block) => {
          if (block.type === "question_single") {
            return renderSingleChoiceBlock(block);
          }
          return renderTextBlock(block);
        })}

        {progress === 100 && (
          <View
            style={{
              marginTop: 8,
              borderWidth: 1,
              borderColor: theme.colors.success,
              borderRadius: theme.radiusLg,
              padding: 16,
              backgroundColor: theme.colors.successBg,
              ...theme.elevation.subtle,
            }}
          >
            <Text style={{ color: theme.colors.success, fontWeight: "700", fontSize: 17 }}>
              Lesson completed.
            </Text>
            <Text style={{ color: theme.colors.success, marginTop: 6, lineHeight: 20 }}>
              You finished all required steps in this training. The next pass can focus on speed and confidence.
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}
