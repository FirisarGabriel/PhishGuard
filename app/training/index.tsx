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
  Image,
  type ImageSourcePropType,
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
import { getAssignmentsForUser } from "../../src/repos/b2b";

// ===== DB imports =====
import {
  deleteLesson,
  getAssignmentLessonProgressMap,
  getLessons,
  getProgressMap,
} from "../../src/repos/lessons";
import type { AssignmentRecipient, Lesson } from "../../src/types/models";

type ProgressMap = Record<string, number>; // lessonId -> 0..100
type AssignedTrainingItem = AssignmentRecipient & {
  assignmentTitle?: string | null;
  lessonTitle: string;
  lessonSummary: string;
  progress: number;
  organizationName?: string;
};

const trainingThumbnailEntries: Array<{
  titles: string[];
  source: ImageSourcePropType;
}> = [
  {
    titles: ["Spot Suspicious Links Before You Tap", "Spotting Suspicious Links"],
    source: require("../../assets/training-thumbnails/suspicious_links.png"),
  },
  {
    titles: ["Resist Urgency and Fear Tactics", "Urgency and Fear Tactics"],
    source: require("../../assets/training-thumbnails/urgency.png"),
  },
  {
    titles: ["Verify the Real Sender", "Sender Email Address Tricks"],
    source: require("../../assets/training-thumbnails/real_sender.png"),
  },
  {
    titles: ["Handle Attachments Safely", "Attachments and Downloads"],
    source: require("../../assets/training-thumbnails/attachements.png"),
  },
  {
    titles: [
      "Question Too-Good-To-Be-True Offers",
      "Too Good to Be True Offers",
      "Question Offers That Sound Too Good",
    ],
    source: require("../../assets/training-thumbnails/offers_too_good.png"),
  },
];

const trainingThumbnailStyle = {
  width: "100%" as const,
  height: 180,
  borderRadius: 14,
  borderWidth: 1,
  borderColor: theme.colors.border,
  backgroundColor: theme.colors.surface2,
};

function normalizeTrainingTitle(title: string) {
  return title.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function getTrainingThumbnailSource(title: string) {
  const normalizedTitle = normalizeTrainingTitle(title);
  return trainingThumbnailEntries.find((entry) =>
    entry.titles.some(
      (candidateTitle) => normalizeTrainingTitle(candidateTitle) === normalizedTitle
    )
  )?.source;
}

function formatDueDate(value?: number | null) {
  if (!value) return null;

  try {
    return new Intl.DateTimeFormat("en", {
      month: "short",
      day: "numeric",
    }).format(new Date(value));
  } catch {
    return null;
  }
}

function getAssignmentTone(status: AssignedTrainingItem["status"]) {
  switch (status) {
    case "completed":
      return {
        border: theme.colors.success,
        bg: theme.colors.successBg,
        text: theme.colors.success,
        label: "Completed",
      };
    case "in_progress":
      return {
        border: theme.colors.primary,
        bg: theme.colors.primaryMuted,
        text: theme.colors.primary,
        label: "In progress",
      };
    case "overdue":
      return {
        border: theme.colors.errorBorder,
        bg: theme.colors.errorBg,
        text: theme.colors.error,
        label: "Overdue",
      };
    default:
      return {
        border: theme.colors.borderStrong,
        bg: theme.colors.surface3,
        text: theme.colors.muted,
        label: "Assigned",
      };
  }
}

export default function LessonList() {
  const router = useRouter();

  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [progress, setProgress] = useState<ProgressMap>({});
  const [assigned, setAssigned] = useState<AssignedTrainingItem[]>([]);

  const { user, adminMode, organizations } = useAuth();
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

      const [ls, pm, assignmentProgress, assignments] = await Promise.all([
        getLessons(),
        getProgressMap(userId),
        getAssignmentLessonProgressMap(userId),
        getAssignmentsForUser(userId),
      ]);

      setLessons(ls);

      const map: ProgressMap = {};
      Object.values(pm).forEach((p: any) => {
        map[p.lessonId] = typeof p.completion === "number" ? p.completion : 0;
      });
      setProgress(map);

      const lessonsById = new Map(ls.map((lesson) => [lesson.id, lesson]));
      const organizationsById = new Map(
        organizations.map((organization) => [organization.id, organization.name])
      );

      const assignedItems = assignments
        .filter((assignment) => assignment.status !== "cancelled")
        .reduce<AssignedTrainingItem[]>((items, assignment) => {
          const lesson = lessonsById.get(assignment.lessonId);
          if (!lesson) {
            return items;
          }

          items.push({
            ...assignment,
            lessonTitle: lesson.title,
            lessonSummary: lesson.summary,
            progress: assignmentProgress[assignment.id]?.completion ?? 0,
            organizationName: organizationsById.get(assignment.organizationId) ?? undefined,
          });

          return items;
        }, [])
        .sort((a, b) => {
          const aPriority = a.status === "overdue" ? 0 : a.status === "in_progress" ? 1 : a.status === "not_started" ? 2 : 3;
          const bPriority = b.status === "overdue" ? 0 : b.status === "in_progress" ? 1 : b.status === "not_started" ? 2 : 3;
          if (aPriority !== bPriority) {
            return aPriority - bPriority;
          }
          return (b.assignedAt ?? 0) - (a.assignedAt ?? 0);
        });

      setAssigned(assignedItems);
    } catch (e: any) {
      setErr(e?.message ?? "Failed to load lessons.");
    } finally {
      setLoading(false);
    }
  }, [organizations, userId]);

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

  const assignedData = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return assigned;

    return assigned.filter(
      (item) =>
        item.lessonTitle.toLowerCase().includes(term) ||
        item.lessonSummary.toLowerCase().includes(term) ||
        (item.assignmentTitle ?? "").toLowerCase().includes(term) ||
        (item.organizationName ?? "").toLowerCase().includes(term)
    );
  }, [assigned, q]);

  const goToLesson = useCallback(
    (id: string, params?: { assignmentRecipientId?: string }) => {
      router.push({
        pathname: "/training/[id]",
        params: {
          id,
          assignmentRecipientId: params?.assignmentRecipientId,
        },
      });
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

  const renderAssignedCard = useCallback(
    (item: AssignedTrainingItem) => {
      const tone = getAssignmentTone(item.status);
      const dueLabel = formatDueDate(item.dueAt);
      const thumbnailSource = getTrainingThumbnailSource(item.lessonTitle);

      return (
        <Pressable
          key={item.id}
          onPress={() =>
            goToLesson(item.lessonId, { assignmentRecipientId: item.id })
          }
          style={({ pressed }) => ({
            ...ui.cardElevated,
            backgroundColor: pressed ? theme.colors.cardPressed : theme.colors.surface1,
            borderColor: tone.border,
            padding: 14,
            gap: 10,
            marginBottom: 10,
          })}
        >
          {thumbnailSource && (
            <Image
              source={thumbnailSource}
              resizeMode="contain"
              style={trainingThumbnailStyle}
            />
          )}

          <View
            style={{
              flexDirection: "row",
              alignItems: "flex-start",
              justifyContent: "space-between",
              gap: 12,
            }}
          >
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={{ fontSize: 16, fontWeight: "700", color: theme.colors.text }}>
                {item.assignmentTitle?.trim() || item.lessonTitle}
              </Text>
              {item.assignmentTitle?.trim() && (
                <Text style={{ color: theme.colors.muted }}>
                  Training: {item.lessonTitle}
                </Text>
              )}
            </View>

            <View
              style={{
                ...ui.chip,
                backgroundColor: tone.bg,
                borderColor: tone.border,
              }}
            >
              <Text style={{ color: tone.text, fontWeight: "700" }}>{tone.label}</Text>
            </View>
          </View>

          <Text style={{ color: theme.colors.muted }}>{item.lessonSummary}</Text>

          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {item.organizationName && (
              <View style={ui.chip}>
                <Text style={{ color: theme.colors.text, fontWeight: "600" }}>
                  {item.organizationName}
                </Text>
              </View>
            )}

            {dueLabel && (
              <View
                style={{
                  ...ui.chip,
                  borderColor: item.status === "overdue" ? theme.colors.errorBorder : theme.colors.border,
                  backgroundColor: item.status === "overdue" ? theme.colors.errorBg : theme.colors.surface2,
                }}
              >
                <Text
                  style={{
                    color: item.status === "overdue" ? theme.colors.error : theme.colors.muted,
                    fontWeight: "600",
                  }}
                >
                  Due {dueLabel}
                </Text>
              </View>
            )}
          </View>

          <View style={{ gap: 6 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={{ color: theme.colors.muted, fontSize: 12, fontWeight: "700" }}>
                YOUR PROGRESS
              </Text>
              <Text style={{ color: theme.colors.text, fontWeight: "700" }}>{item.progress}%</Text>
            </View>
            <ProgressBar value={item.progress} />
          </View>
        </Pressable>
      );
    },
    [goToLesson]
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
    <View style={{ flex: 1, backgroundColor: theme.colors.bg, paddingHorizontal: 16 }}>
      <FlatList
        data={data}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingTop: 16, paddingBottom: 20 }}
        showsVerticalScrollIndicator={false}
        ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListHeaderComponent={
          <View style={{ paddingBottom: 12 }}>
            <Text style={theme.typography.titleLg}>Training</Text>
            <Text style={{ color: theme.colors.muted, marginTop: 4 }}>
              Short lessons you can finish fast.
            </Text>

            <View style={{ marginTop: 12, marginBottom: 8 }}>
              <TextInput
                placeholder="Search lessons"
                placeholderTextColor={theme.colors.muted}
                value={q}
                onChangeText={setQ}
                style={ui.input}
              />
            </View>

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

            {organizations.length > 0 && (
              <View style={{ marginTop: 8, marginBottom: 6 }}>
                <Text style={theme.typography.sectionTitle}>Assigned to me</Text>
                <Text style={{ color: theme.colors.muted, marginTop: 4 }}>
                  Trainings assigned by your organization.
                </Text>

                <View style={{ marginTop: 12 }}>
                  {assignedData.length > 0 ? (
                    assignedData.map(renderAssignedCard)
                  ) : (
                    <View style={ui.mutedPanel}>
                      <Text style={{ color: theme.colors.muted }}>
                        {q.trim()
                          ? "No assignments match your search."
                          : "No active assignments yet. Explore the catalog below in the meantime."}
                      </Text>
                    </View>
                  )}
                </View>
              </View>
            )}

            <View style={{ marginTop: organizations.length > 0 ? 18 : 0, marginBottom: 12 }}>
              <Text style={theme.typography.sectionTitle}>Explore</Text>
              <Text style={{ color: theme.colors.muted, marginTop: 4 }}>
                Short lessons you can finish fast.
              </Text>
            </View>
          </View>
        }
        renderItem={({ item }) => {
          const p = progress[item.id] ?? 0;
          const thumbnailSource = getTrainingThumbnailSource(item.title);

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
              {thumbnailSource && (
                <Image
                  source={thumbnailSource}
                  resizeMode="contain"
                  style={{
                    ...trainingThumbnailStyle,
                    marginBottom: 12,
                  }}
                />
              )}

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
              {q.trim() ? "No lessons match your search." : "No lessons available right now."}
            </Text>
          </View>
        }
      />
    </View>
  );
}


