import { useLocalSearchParams, useRouter } from "expo-router";
import { View, Text, Pressable, ActivityIndicator, ScrollView, InteractionManager } from "react-native";
import { useEffect, useState, useCallback, useRef } from "react";
import ConfettiCannon from "react-native-confetti-cannon";
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
  const [hasScrolled, setHasScrolled] = useState(false);

  const confettiRef = useRef<any>(null);
  const prevProgressRef = useRef(0);
  const scrollViewRef = useRef<ScrollView | null>(null);
  const pendingCompletionRevealRef = useRef(false);
  const router = useRouter();

  const { user } = useAuth();
  const { notifyAchievements } = useAchievementToast();
  const userId = user?.id ?? null;

  const isBlockCompleted = useCallback(
    (
      block: TrainingBlockWithOptions,
      progressMap: Record<string, TrainingBlockProgress>
    ) => {
      const current = progressMap[block.id];
      return block.type === "question_single"
        ? current?.isCorrect === 1
        : current?.status === "completed";
    },
    []
  );

  const computeProgressFromMap = useCallback(
    (progressMap: Record<string, TrainingBlockProgress>) => {
      const requiredBlocks = blocks.filter((block) => block.isRequired === 1);
      if (!requiredBlocks.length) return 0;

      const completedRequired = requiredBlocks.filter((block) =>
        isBlockCompleted(block, progressMap)
      ).length;

      return Math.round((completedRequired / requiredBlocks.length) * 100);
    },
    [blocks, isBlockCompleted]
  );

  const revealCompletionCta = useCallback(() => {
    pendingCompletionRevealRef.current = true;
    confettiRef.current?.start();
    requestAnimationFrame(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    });
  }, []);

  const maybeRevealCompletionCta = useCallback(
    (nextProgress: number) => {
      if (prevProgressRef.current < 100 && nextProgress === 100) {
        revealCompletionCta();
      }
      prevProgressRef.current = nextProgress;
    },
    [revealCompletionCta]
  );

  const waitForInteractions = useCallback(
    () =>
      new Promise<void>((resolve) => {
        InteractionManager.runAfterInteractions(() => resolve());
      }),
    []
  );

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

      const previousBlockProgress = blockProgress;
      const nextBlockProgress = {
        ...blockProgress,
        [blockId]: {
          ...blockProgress[blockId],
          id: blockProgress[blockId]?.id ?? `optimistic-${blockId}`,
          userId,
          lessonId: lesson.id,
          blockId,
          status: "completed" as const,
          pendingSync: 1 as const,
          completedAt: Date.now(),
        },
      };
      const nextProgress = computeProgressFromMap(nextBlockProgress);

      try {
        setSavingBlockId(blockId);
        setBlockProgress(nextBlockProgress);
        setProgress(nextProgress);
        maybeRevealCompletionCta(nextProgress);
        await waitForInteractions();
        await completeTextBlock(userId, lesson.id, blockId);
        void refreshProgress();
      } catch (e: any) {
        setBlockProgress(previousBlockProgress);
        setProgress(computeProgressFromMap(previousBlockProgress));
        setErr(e?.message ?? "Failed to save block progress.");
      } finally {
        setSavingBlockId(null);
      }
    },
    [blockProgress, computeProgressFromMap, lesson, maybeRevealCompletionCta, refreshProgress, userId, waitForInteractions]
  );

  const onSelectOption = useCallback(
    async (blockId: string, optionId: string) => {
      if (!userId || !lesson) {
        setErr("Not signed in.");
        return;
      }

      const previousBlockProgress = blockProgress;
      const nextIsCorrect = blocks.find((block) => block.id === blockId)?.options.some(
        (option) => option.id === optionId && option.isCorrect === 1
      );
      const nextBlockProgress = {
        ...blockProgress,
        [blockId]: {
          ...blockProgress[blockId],
          id: blockProgress[blockId]?.id ?? `optimistic-${blockId}`,
          userId,
          lessonId: lesson.id,
          blockId,
          status: nextIsCorrect ? ("completed" as const) : ("not_started" as const),
          selectedOptionId: optionId,
          isCorrect: nextIsCorrect ? (1 as const) : (0 as const),
          pendingSync: 1 as const,
          completedAt: nextIsCorrect ? Date.now() : null,
        },
      };
      const nextProgress = computeProgressFromMap(nextBlockProgress);
      const wasCorrect = blockProgress[blockId]?.isCorrect === 1;

      try {
        setSavingBlockId(blockId);
        setBlockProgress(nextBlockProgress);
        setProgress(nextProgress);
        maybeRevealCompletionCta(nextProgress);
        await waitForInteractions();
        const { isCorrect } = await submitSingleChoiceAnswer(
          userId,
          lesson.id,
          blockId,
          optionId
        );
        void refreshProgress();

        if (isCorrect) {
          const unlocked = await evaluateTrainingAchievements(userId);
          notifyAchievements(unlocked);
        }
      } catch (e: any) {
        setBlockProgress(previousBlockProgress);
        setProgress(computeProgressFromMap(previousBlockProgress));
        setErr(e?.message ?? "Failed to submit answer.");
      } finally {
        setSavingBlockId(null);
      }
    },
    [blockProgress, blocks, computeProgressFromMap, lesson, maybeRevealCompletionCta, notifyAchievements, refreshProgress, userId, waitForInteractions]
  );

  useEffect(() => {
    prevProgressRef.current = progress;
  }, [progress]);

  const onScrollContentSizeChange = useCallback(() => {
    if (!pendingCompletionRevealRef.current) return;

    scrollViewRef.current?.scrollToEnd({ animated: true });
    pendingCompletionRevealRef.current = false;
  }, []);

  const onContentScroll = useCallback((offsetY: number) => {
    const next = offsetY > 6;
    setHasScrolled((prev) => (prev === next ? prev : next));
  }, []);

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

    return (
      <View
        style={{
          ...ui.cardElevated,
          padding: 16,
          marginBottom: 0,
          gap: 12,
          backgroundColor: theme.colors.surface1,
          borderColor: done ? theme.colors.success : theme.colors.borderStrong,
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

          <View
            style={{
              ...ui.chip,
              backgroundColor: done ? theme.colors.successBg : theme.colors.surface3,
              borderColor: done ? theme.colors.success : theme.colors.borderStrong,
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
            borderColor: done ? theme.colors.success : theme.colors.borderStrong,
            borderRadius: theme.radiusSm,
            padding: 12,
            alignItems: "center",
            backgroundColor: done ? theme.colors.successBg : theme.colors.surface3,
            ...theme.elevation.subtle,
          })}
        >
          <Text
            style={{
              fontWeight: "700",
              color: done ? theme.colors.success : theme.colors.text,
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

    return (
      <View
        style={{
          ...ui.cardElevated,
          padding: 16,
          marginBottom: 0,
          gap: 12,
          backgroundColor: theme.colors.surface1,
          borderColor: isCorrect ? theme.colors.success : theme.colors.borderStrong,
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

          <View
            style={{
              ...ui.chip,
              backgroundColor: isCorrect ? theme.colors.successBg : theme.colors.surface3,
              borderColor: isCorrect ? theme.colors.success : theme.colors.borderStrong,
            }}
          >
            <Text
              style={{
                color: isCorrect ? theme.colors.success : theme.colors.muted,
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
                      : theme.colors.surface3,
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
                ...theme.elevation.subtle,
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
                        ? theme.colors.borderStrong
                        : theme.colors.borderStrong,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor:
                    isSelected && isCorrect
                      ? theme.colors.success
                      : isSelected
                        ? theme.colors.surface3
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
                          ? theme.colors.text
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
          paddingBottom: 2,
          backgroundColor: theme.colors.bg,
          ...(hasScrolled ? theme.elevation.subtle : {}),
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <View
            style={{
              flex: 1,
              borderWidth: 1,
              borderColor: theme.colors.borderStrong,
              borderRadius: 999,
              padding: 2,
              backgroundColor: theme.colors.surface1,
              shadowColor: theme.colors.shadow,
              shadowOpacity: 0.14,
              shadowRadius: 10,
              shadowOffset: { width: 0, height: 4 },
              elevation: 5,
            }}
          >
            <ProgressBar value={progress} />
          </View>
        </View>
      </View>

      <ScrollView
        ref={scrollViewRef}
        onContentSizeChange={onScrollContentSizeChange}
        onScroll={(e) => onContentScroll(e.nativeEvent.contentOffset.y)}
        scrollEventThrottle={16}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 28 }}
      >
        <View
          style={{
            marginBottom: 16,
            gap: 6,
          }}
        >
          <Text style={{ fontSize: 21, fontWeight: "700", color: theme.colors.text }}>
            {lesson.title}
          </Text>
          <Text style={{ color: theme.colors.muted, lineHeight: 21 }}>
            {lesson.summary}
          </Text>
        </View>

        {blocks.map((block, index) => {
          const isLast = index === blocks.length - 1;
          const isDone =
            block.type === "question_single"
              ? blockProgress[block.id]?.isCorrect === 1
              : blockProgress[block.id]?.status === "completed";

          return (
            <View key={block.id} style={{ flexDirection: "row", marginBottom: 14 }}>
              {/* Coloana timeline */}
              <View style={{ width: 44, alignItems: "center", paddingTop: 18 }}>
                <View
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 999,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: isDone ? theme.colors.successBg : theme.colors.surface2,
                    borderWidth: 1,
                    borderColor: isDone ? theme.colors.success : theme.colors.borderStrong,
                  }}
                >
                  <Text
                    style={{
                      fontWeight: "700",
                      fontSize: 13,
                      color: isDone ? theme.colors.success : theme.colors.muted,
                    }}
                  >
                    {isDone ? "✓" : String(index + 1)}
                  </Text>
                </View>
                {!isLast && (
                  <View
                    style={{
                      width: 2,
                      flex: 1,
                      marginTop: 6,
                      marginBottom: -14,
                      backgroundColor: isDone ? theme.colors.success : theme.colors.border,
                      opacity: 0.6,
                    }}
                  />
                )}
              </View>

              <View style={{ flex: 1 }}>
                {block.type === "question_single"
                  ? renderSingleChoiceBlock(block)
                  : renderTextBlock(block)}
              </View>
            </View>
          );
        })}

        {progress === 100 && (
          <View
            style={{
              marginTop: 8,
              borderWidth: 1,
              borderColor: theme.colors.success,
              borderRadius: theme.radiusLg,
              padding: 20,
              backgroundColor: theme.colors.successBg,
              gap: 10,
              alignItems: "center",
              ...theme.elevation.subtle,
            }}
          >
            <Text style={{ fontSize: 36 }}>🎉</Text>
            <Text style={{ color: theme.colors.success, fontWeight: "700", fontSize: 18, textAlign: "center" }}>
              Lesson completed!
            </Text>
            <Text style={{ color: theme.colors.success, lineHeight: 20, textAlign: "center" }}>
              You finished all required steps in this training. The next pass can focus on speed and confidence.
            </Text>
            <Pressable
              onPress={() => router.back()}
              style={({ pressed }) => ({
                marginTop: 4,
                paddingVertical: 12,
                paddingHorizontal: 28,
                borderRadius: theme.radiusSm,
                backgroundColor: theme.colors.success,
                opacity: pressed ? 0.85 : 1,
                ...theme.elevation.subtle,
              })}
            >
              <Text style={{ color: theme.colors.textInverse, fontWeight: "700", fontSize: 15 }}>
                Back to lessons
              </Text>
            </Pressable>
          </View>
        )}
      </ScrollView>

      {/* Confetti cannon - declanșat programatic prin ref */}
      <ConfettiCannon
        ref={confettiRef}
        count={180}
        origin={{ x: 200, y: -20 }}
        autoStart={false}
        fadeOut
        explosionSpeed={350}
        fallSpeed={3000}
      />
    </View>
  );
}
