import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { ErrorBanner } from "../src/Feedback";
import { useAuth } from "../src/auth/AuthProvider";
import {
  createTrainingAssignment,
  getOrganizationMembersWithProfiles,
  type OrganizationMemberContact,
  getTeamsForOrganization,
  getTeamMembers,
} from "../src/repos/b2b";
import { getLessons } from "../src/repos/lessons";
import { runHybridSync } from "../src/sync/hybrid";
import { theme } from "../src/theme";
import { ui } from "../src/ui";
import type { Lesson, Team, TeamMember } from "../src/types/models";

type TeamWithMembers = Team & {
  members: TeamMember[];
};

function formatMemberRole(role: OrganizationMemberContact["role"]) {
  switch (role) {
    case "org_owner":
      return "Owner";
    case "org_manager":
      return "Manager";
    default:
      return "Employee";
  }
}

function formatMemberIdentity(member: OrganizationMemberContact) {
  return member.email?.trim() || member.userId;
}

function formatDuePreview(daysInput: string) {
  const days = Number(daysInput);
  if (!Number.isFinite(days) || days <= 0) return null;
  const dueAt = Date.now() + days * 24 * 60 * 60 * 1000;
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(
    new Date(dueAt)
  );
}

export default function OrganizationCreateAssignmentScreen() {
  const { user, organizations } = useAuth();
  const { organizationId } = useLocalSearchParams<{ organizationId?: string }>();

  const managerOrganizations = useMemo(
    () =>
      organizations.filter(
        (organization) =>
          organization.membershipStatus === "active" &&
          (organization.membershipRole === "org_owner" ||
            organization.membershipRole === "org_manager")
      ),
    [organizations]
  );

  const currentOrganization = useMemo(() => {
    if (organizationId) {
      const match = managerOrganizations.find((organization) => organization.id === organizationId);
      if (match) return match;
    }

    return managerOrganizations[0] ?? null;
  }, [managerOrganizations, organizationId]);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [members, setMembers] = useState<OrganizationMemberContact[]>([]);
  const [teams, setTeams] = useState<TeamWithMembers[]>([]);
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [dueInDays, setDueInDays] = useState("");
  const [selectedLessonId, setSelectedLessonId] = useState<string | null>(null);
  const [targetType, setTargetType] = useState<"user" | "team">("user");
  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null);

  const activeMembers = useMemo(
    () => members.filter((member) => member.status === "active"),
    [members]
  );
  const selectedTeam = useMemo(
    () => teams.find((team) => team.id === selectedTargetId) ?? null,
    [selectedTargetId, teams]
  );

  const duePreview = formatDuePreview(dueInDays);

  const load = useCallback(async () => {
    if (!currentOrganization) {
      setLoading(false);
      return;
    }

    try {
      setError(null);
      setLoading(true);

      if (user?.id) {
        try {
          await runHybridSync(user.id, { trigger: "assignment_form_load" });
        } catch {
          // Keep the cached form usable if background sync fails.
        }
      }

      const [lessonRows, memberRows, teamRows] = await Promise.all([
        getLessons(),
        getOrganizationMembersWithProfiles(currentOrganization.id),
        getTeamsForOrganization(currentOrganization.id),
      ]);

      const teamMemberRows = await Promise.all(teamRows.map((team) => getTeamMembers(team.id)));

      setLessons(lessonRows);
      setMembers(memberRows);
      setTeams(
        teamRows.map((team, index) => ({
          ...team,
          members: teamMemberRows[index] ?? [],
        }))
      );
      setSelectedLessonId((prev) => prev ?? lessonRows[0]?.id ?? null);
      setSelectedTargetId((prev) => {
        if (prev) return prev;
        return targetType === "user"
          ? memberRows.find((member) => member.status === "active")?.userId ?? null
          : teamRows.find((team, index) => (teamMemberRows[index]?.length ?? 0) > 0)?.id ?? null;
      });
    } catch (e: any) {
      setError(e?.message ?? "Failed to load assignment form.");
    } finally {
      setLoading(false);
    }
  }, [currentOrganization, targetType, user?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setSelectedTargetId(
      targetType === "user"
        ? activeMembers[0]?.userId ?? null
        : teams.find((team) => team.members.length > 0)?.id ?? null
    );
  }, [activeMembers, targetType, teams]);

  const onSubmit = useCallback(async () => {
    if (!currentOrganization || !user?.id) {
      setError("Missing organization or user context.");
      return;
    }

    if (!selectedLessonId || !selectedTargetId) {
      setError("Select a lesson and a target first.");
      return;
    }

    const parsedDays = Number(dueInDays);
    const dueAt = Number.isFinite(parsedDays) && parsedDays > 0
      ? Date.now() + parsedDays * 24 * 60 * 60 * 1000
      : null;

    try {
      setError(null);
      setSubmitting(true);

      const result = await createTrainingAssignment({
        organizationId: currentOrganization.id,
        lessonId: selectedLessonId,
        title,
        note,
        targetType,
        targetId: selectedTargetId,
        assignedBy: user.id,
        dueAt,
      });

      Alert.alert(
        "Assignment created",
        targetType === "team"
          ? `Team assignment saved for ${result.recipients.length} recipient${result.recipients.length === 1 ? "" : "s"}.`
          : `Saved ${result.recipients.length} recipient${result.recipients.length === 1 ? "" : "s"}.`
      );
      router.back();
    } catch (e: any) {
      setError(
        e?.message ??
          "Failed to create assignment. This action currently requires a working connection."
      );
    } finally {
      setSubmitting(false);
    }
  }, [
    currentOrganization,
    dueInDays,
    note,
    selectedLessonId,
    selectedTargetId,
    targetType,
    title,
    user?.id,
  ]);

  if (!currentOrganization) {
    return (
      <View style={{ ...ui.screenPadded, justifyContent: "center", gap: 12 }}>
        <Text style={theme.typography.titleLg}>Create Assignment</Text>
        <Text style={{ color: theme.colors.muted }}>
          Manager access is required to create assignments.
        </Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={{ ...ui.screen, ...ui.centered }}>
        <ActivityIndicator />
        <Text style={{ marginTop: 8, color: theme.colors.muted }}>Loading assignment form...</Text>
      </View>
    );
  }

  return (
    <ScrollView style={ui.screen} contentContainerStyle={{ padding: 20, gap: 16 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={theme.typography.titleLg}>Create Assignment</Text>
          <Text style={{ color: theme.colors.muted }}>{currentOrganization.name}</Text>
        </View>

        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => ({
            ...ui.button,
            opacity: pressed ? 0.8 : 1,
            paddingVertical: 10,
            paddingHorizontal: 12,
          })}
        >
          <Ionicons name="close" size={18} />
        </Pressable>
      </View>

      {error && <ErrorBanner message={error} />}

      <View style={ui.screenSection}>
        <Text style={theme.typography.sectionTitle}>Details</Text>
        <View style={{ gap: 12, marginTop: 14 }}>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="Assignment title (optional)"
            placeholderTextColor={theme.colors.muted}
            style={ui.input}
          />
          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder="Note for employees (optional)"
            placeholderTextColor={theme.colors.muted}
            style={[ui.input, { minHeight: 92, textAlignVertical: "top" }]}
            multiline
          />
          <TextInput
            value={dueInDays}
            onChangeText={setDueInDays}
            placeholder="Due in days (optional)"
            placeholderTextColor={theme.colors.muted}
            keyboardType="numeric"
            style={ui.input}
          />
          {duePreview && <Text style={{ color: theme.colors.muted }}>Due date preview: {duePreview}</Text>}
        </View>
      </View>

      <View style={ui.screenSection}>
        <Text style={theme.typography.sectionTitle}>Choose training</Text>
        <View style={{ gap: 10, marginTop: 14 }}>
          {lessons.map((lesson) => {
            const selected = selectedLessonId === lesson.id;
            return (
              <Pressable
                key={lesson.id}
                onPress={() => setSelectedLessonId(lesson.id)}
                style={({ pressed }) => ({
                  ...ui.card,
                  padding: 12,
                  borderColor: selected ? theme.colors.primary : theme.colors.border,
                  backgroundColor: selected
                    ? theme.colors.primaryMuted
                    : pressed
                      ? theme.colors.cardPressed
                      : theme.colors.surface1,
                })}
              >
                <Text style={{ fontWeight: "700", color: theme.colors.text }}>{lesson.title}</Text>
                <Text style={{ color: theme.colors.muted, marginTop: 4 }}>{lesson.summary}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={ui.screenSection}>
        <Text style={theme.typography.sectionTitle}>Choose target</Text>
        <View style={{ flexDirection: "row", gap: 10, marginTop: 14, marginBottom: 14 }}>
          <Pressable
            onPress={() => setTargetType("user")}
            style={({ pressed }) => ({
              ...ui.button,
              flex: 1,
              opacity: pressed ? 0.85 : 1,
              borderColor: targetType === "user" ? theme.colors.primary : theme.colors.border,
              backgroundColor: targetType === "user" ? theme.colors.primaryMuted : theme.colors.surface1,
            })}
          >
            <Text style={{ fontWeight: "700", color: targetType === "user" ? theme.colors.primary : theme.colors.text }}>
              Individual
            </Text>
          </Pressable>

          <Pressable
            onPress={() => setTargetType("team")}
            style={({ pressed }) => ({
              ...ui.button,
              flex: 1,
              opacity: pressed ? 0.85 : 1,
              borderColor: targetType === "team" ? theme.colors.primary : theme.colors.border,
              backgroundColor: targetType === "team" ? theme.colors.primaryMuted : theme.colors.surface1,
            })}
          >
            <Text style={{ fontWeight: "700", color: targetType === "team" ? theme.colors.primary : theme.colors.text }}>
              Team
            </Text>
          </Pressable>
        </View>

        <View style={{ gap: 10 }}>
          {targetType === "user"
            ? activeMembers.map((member) => {
                const selected = selectedTargetId === member.userId;
                return (
                  <Pressable
                    key={member.id}
                    onPress={() => setSelectedTargetId(member.userId)}
                    style={({ pressed }) => ({
                      ...ui.card,
                      padding: 12,
                      borderColor: selected ? theme.colors.primary : theme.colors.border,
                      backgroundColor: selected
                        ? theme.colors.primaryMuted
                        : pressed
                          ? theme.colors.cardPressed
                          : theme.colors.surface1,
                    })}
                  >
                    <Text style={{ fontWeight: "700", color: theme.colors.text }}>
                      {formatMemberIdentity(member)}
                    </Text>
                    <Text style={{ color: theme.colors.muted, marginTop: 4 }}>
                      {formatMemberRole(member.role)}
                    </Text>
                  </Pressable>
                );
              })
            : teams.map((team) => {
                const selected = selectedTargetId === team.id;
                const disabled = team.members.length === 0;
                return (
                  <Pressable
                    key={team.id}
                    onPress={() => {
                      if (!disabled) {
                        setSelectedTargetId(team.id);
                      }
                    }}
                    style={({ pressed }) => ({
                      ...ui.card,
                      padding: 12,
                      opacity: disabled ? 0.55 : 1,
                      borderColor: selected ? theme.colors.primary : theme.colors.border,
                      backgroundColor: selected
                        ? theme.colors.primaryMuted
                        : pressed && !disabled
                          ? theme.colors.cardPressed
                          : theme.colors.surface1,
                    })}
                  >
                    <Text style={{ fontWeight: "700", color: theme.colors.text }}>{team.name}</Text>
                    <Text style={{ color: theme.colors.muted, marginTop: 4 }}>
                      {team.members.length} member{team.members.length === 1 ? "" : "s"}
                    </Text>
                    {disabled ? (
                      <Text style={{ color: theme.colors.error, marginTop: 4 }}>
                        Add members to this team before assigning.
                      </Text>
                    ) : (
                      <Text style={{ color: theme.colors.muted, marginTop: 4 }}>
                        {team.members
                          .map((teamMember) => {
                            const member = members.find((candidate) => candidate.userId === teamMember.userId);
                            return member ? formatMemberIdentity(member) : teamMember.userId;
                          })
                          .slice(0, 3)
                          .join(", ")}
                        {team.members.length > 3 ? ` +${team.members.length - 3} more` : ""}
                      </Text>
                    )}
                  </Pressable>
                );
              })}
        </View>

        {targetType === "team" && selectedTeam && (
          <View style={{ ...ui.mutedPanel, marginTop: 14, gap: 6 }}>
            <Text style={{ fontWeight: "700", color: theme.colors.text }}>
              Selected team recipients
            </Text>
            <Text style={{ color: theme.colors.muted }}>
              {selectedTeam.members.length} member{selectedTeam.members.length === 1 ? "" : "s"} will receive this assignment.
            </Text>
            <Text style={{ color: theme.colors.muted }}>
              {selectedTeam.members
                .map((teamMember) => {
                  const member = members.find((candidate) => candidate.userId === teamMember.userId);
                  return member ? formatMemberIdentity(member) : teamMember.userId;
                })
                .join(", ")}
            </Text>
          </View>
        )}
      </View>

      <Pressable
        onPress={onSubmit}
        disabled={submitting || !selectedLessonId || !selectedTargetId}
        style={({ pressed }) => ({
          ...ui.buttonPrimary,
          opacity: submitting || !selectedLessonId || !selectedTargetId ? 0.6 : pressed ? 0.85 : 1,
        })}
      >
        {submitting ? (
          <ActivityIndicator color={theme.colors.textInverse} />
        ) : (
          <Text style={{ color: theme.colors.textInverse, fontWeight: "700" }}>Create assignment</Text>
        )}
      </Pressable>
    </ScrollView>
  );
}