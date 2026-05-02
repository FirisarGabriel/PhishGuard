import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";

import { ErrorBanner } from "../src/Feedback";
import ProgressBar from "../src/ProgressBar";
import { useAuth } from "../src/auth/AuthProvider";
import {
  createTeam,
  createOrganizationInvite,
  deleteTrainingAssignment,
  deleteTeam,
  getAssignmentRecipientsForAssignment,
  type AssignmentRecipientProgressDetails,
  getAssignmentRecipientStatsMap,
  getAssignmentsForOrganization,
  getInvitesForOrganization,
  getOrganizationMembers,
  getOrganizationMembersWithProfiles,
  getTeamsForOrganization,
  getTeamMembers,
  resendOrganizationInvite,
  setTeamMembers,
  type OrganizationMemberContact,
  updateOrganizationInviteStatus,
  updateOrganizationMemberStatus,
  updateTeam,
} from "../src/repos/b2b";
import { getLessonById } from "../src/repos/lessons";
import { runHybridSync } from "../src/sync/hybrid";
import { theme } from "../src/theme";
import { ui } from "../src/ui";
import type { OrganizationInvite, OrganizationRole, Team, TeamMember, TrainingAssignment } from "../src/types/models";

type AssignmentWithSummary = TrainingAssignment & {
  lessonTitle?: string;
  recipientCount: number;
  completedCount: number;
  inProgressCount: number;
  overdueCount: number;
};

type TeamWithMembers = Team & {
  members: TeamMember[];
};

type OrganizationTab = "people" | "invites" | "teams" | "assignments";

function getRecipientTone(status: AssignmentRecipientProgressDetails["status"]) {
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

function formatMemberRole(role?: AssignmentRecipientProgressDetails["memberRole"] | null) {
  switch (role) {
    case "org_owner":
      return "Owner";
    case "org_manager":
      return "Manager";
    case "employee":
      return "Employee";
    default:
      return "Member";
  }
}

function formatIdentityLabel(email?: string | null, userId?: string | null) {
  return email?.trim() || userId || "Unknown member";
}

function formatMemberContactLabel(member: OrganizationMemberContact) {
  return member.email?.trim() || member.userId;
}

function formatOrganizationRole(role: OrganizationRole) {
  switch (role) {
    case "org_owner":
      return "Owner";
    case "org_manager":
      return "Manager";
    case "employee":
    default:
      return "Employee";
  }
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

function getTabLabel(tab: OrganizationTab) {
  switch (tab) {
    case "people":
      return "People";
    case "invites":
      return "Invites";
    case "teams":
      return "Teams";
    case "assignments":
      return "Assignments";
    default:
      return "People";
  }
}

function getTabIcon(tab: OrganizationTab): keyof typeof Ionicons.glyphMap {
  switch (tab) {
    case "people":
      return "people-outline";
    case "invites":
      return "mail-open-outline";
    case "teams":
      return "layers-outline";
    case "assignments":
      return "briefcase-outline";
    default:
      return "ellipse-outline";
  }
}

function goBackOrHome() {
  if (router.canGoBack()) {
    router.back();
    return;
  }

  router.replace("/home");
}

export default function OrganizationScreen() {
  const { organizations, user } = useAuth();

  const activeOrganizations = useMemo(
    () => organizations.filter((organization) => organization.membershipStatus === "active"),
    [organizations]
  );

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

  const currentOrganization = managerOrganizations[0] ?? activeOrganizations[0] ?? null;
  const hasManagerAccess = !!currentOrganization && managerOrganizations.some(
    (organization) => organization.id === currentOrganization.id
  );

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [memberCount, setMemberCount] = useState(0);
  const [activeManagerCount, setActiveManagerCount] = useState(0);
  const [inviteCount, setInviteCount] = useState(0);
  const [organizationMembers, setOrganizationMembers] = useState<OrganizationMemberContact[]>([]);
  const [teams, setTeams] = useState<TeamWithMembers[]>([]);
  const [invites, setInvites] = useState<OrganizationInvite[]>([]);
  const [assignments, setAssignments] = useState<AssignmentWithSummary[]>([]);
  const [expandedAssignmentId, setExpandedAssignmentId] = useState<string | null>(null);
  const [assignmentMutatingId, setAssignmentMutatingId] = useState<string | null>(null);
  const [recipientDetails, setRecipientDetails] = useState<Record<string, AssignmentRecipientProgressDetails[]>>({});
  const [recipientLoadingId, setRecipientLoadingId] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<OrganizationRole>("employee");
  const [inviteSaving, setInviteSaving] = useState(false);
  const [inviteMutatingId, setInviteMutatingId] = useState<string | null>(null);
  const [teamName, setTeamName] = useState("");
  const [teamDescription, setTeamDescription] = useState("");
  const [teamSaving, setTeamSaving] = useState(false);
  const [expandedTeamId, setExpandedTeamId] = useState<string | null>(null);
  const [teamDraftName, setTeamDraftName] = useState("");
  const [teamDraftDescription, setTeamDraftDescription] = useState("");
  const [teamMemberSelection, setTeamMemberSelection] = useState<string[]>([]);
  const [teamMutatingId, setTeamMutatingId] = useState<string | null>(null);
  const [memberMutatingId, setMemberMutatingId] = useState<string | null>(null);
  const [showInviteHistory, setShowInviteHistory] = useState(false);
  const [activeTab, setActiveTab] = useState<OrganizationTab>("people");

  const load = useCallback(async () => {
    if (!currentOrganization) {
      setLoading(false);
      setError(null);
      setMemberCount(0);
      setActiveManagerCount(0);
      setInviteCount(0);
      setOrganizationMembers([]);
      setTeams([]);
      setInvites([]);
      setAssignments([]);
      setExpandedAssignmentId(null);
      setRecipientDetails({});
      return;
    }

    if (!hasManagerAccess) {
      setLoading(false);
      setError(null);
      setMemberCount(0);
      setActiveManagerCount(0);
      setInviteCount(0);
      setOrganizationMembers([]);
      setTeams([]);
      setInvites([]);
      setAssignments([]);
      setExpandedAssignmentId(null);
      setRecipientDetails({});
      return;
    }

    try {
      setError(null);
      setLoading(true);

      if (user?.id) {
        try {
          await runHybridSync(user.id, { trigger: "organization_screen_load" });
        } catch {
          // Fall back to cached organization data if sync is temporarily unavailable.
        }
      }

      const [members, memberContacts, invites, teamRows, assignmentRows, assignmentStats] = await Promise.all([
        getOrganizationMembers(currentOrganization.id),
        getOrganizationMembersWithProfiles(currentOrganization.id),
        getInvitesForOrganization(currentOrganization.id),
        getTeamsForOrganization(currentOrganization.id),
        getAssignmentsForOrganization(currentOrganization.id),
        getAssignmentRecipientStatsMap(currentOrganization.id),
      ]);

      const [teamMembersList, lessonRows] = await Promise.all([
        Promise.all(teamRows.map((team) => getTeamMembers(team.id))),
        Promise.all(assignmentRows.map((assignment) => getLessonById(assignment.lessonId))),
      ]);

      setMemberCount(members.filter((member) => member.status === "active").length);
      setActiveManagerCount(
        members.filter(
          (member) =>
            member.status === "active" &&
            (member.role === "org_owner" || member.role === "org_manager")
        ).length
      );
      setInviteCount(invites.filter((invite) => invite.status === "pending").length);
      setOrganizationMembers(memberContacts);
      setInvites(invites);

      setTeams(
        teamRows.map((team, index) => ({
          ...team,
          members: teamMembersList[index] ?? [],
        }))
      );

      setAssignments(
        assignmentRows.map((assignment, index) => {
          const stats = assignmentStats[assignment.id] ?? {
            total: 0,
            completed: 0,
            inProgress: 0,
            overdue: 0,
          };

          return {
            ...assignment,
            lessonTitle: lessonRows[index]?.title,
            recipientCount: stats.total,
            completedCount: stats.completed,
            inProgressCount: stats.inProgress,
            overdueCount: stats.overdue,
          };
        })
      );
      setExpandedAssignmentId((current) =>
        current && assignmentRows.some((assignment) => assignment.id === current) ? current : null
      );
    } catch (e: any) {
      setError(e?.message ?? "Failed to load organization overview.");
    } finally {
      setLoading(false);
    }
  }, [currentOrganization, hasManagerAccess, user?.id]);

  const toggleAssignmentDetails = useCallback(async (assignmentId: string) => {
    setExpandedAssignmentId((current) => (current === assignmentId ? null : assignmentId));

    if (recipientDetails[assignmentId] || recipientLoadingId === assignmentId) {
      return;
    }

    try {
      setRecipientLoadingId(assignmentId);
      const rows = await getAssignmentRecipientsForAssignment(assignmentId);
      setRecipientDetails((current) => ({
        ...current,
        [assignmentId]: rows,
      }));
    } catch (e: any) {
      setError(e?.message ?? "Failed to load assignment recipients.");
    } finally {
      setRecipientLoadingId((current) => (current === assignmentId ? null : current));
    }
  }, [recipientDetails, recipientLoadingId]);

  useEffect(() => {
    void load();
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const pendingInvites = useMemo(
    () => invites.filter((invite) => invite.status === "pending"),
    [invites]
  );
  const recentResolvedInvites = useMemo(
    () => invites.filter((invite) => invite.status !== "pending").slice(0, 6),
    [invites]
  );

  const activeMemberOptions = useMemo(
    () => organizationMembers.filter((member) => member.status === "active"),
    [organizationMembers]
  );

  const tabs = useMemo(
    () => [
      { key: "people" as const, label: getTabLabel("people"), count: memberCount },
      { key: "invites" as const, label: getTabLabel("invites"), count: inviteCount },
      { key: "teams" as const, label: getTabLabel("teams"), count: teams.length },
      { key: "assignments" as const, label: getTabLabel("assignments"), count: assignments.length },
    ],
    [assignments.length, inviteCount, memberCount, teams.length]
  );

  const onCreateInvite = useCallback(async () => {
    if (!currentOrganization?.id) {
      setError("No organization selected.");
      return;
    }

    if (!user?.id) {
      setError("You must be signed in to invite people.");
      return;
    }

    try {
      setInviteSaving(true);
      setError(null);
      await createOrganizationInvite({
        organizationId: currentOrganization.id,
        email: inviteEmail,
        role: inviteRole,
        invitedBy: user.id,
      });
      setInviteEmail("");
      await load();
    } catch (e: any) {
      setError(e?.message ?? "Failed to create invite.");
    } finally {
      setInviteSaving(false);
    }
  }, [currentOrganization?.id, inviteEmail, inviteRole, load, user?.id]);

  const onRevokeInvite = useCallback(async (inviteId: string) => {
    try {
      setError(null);
      setInviteMutatingId(inviteId);
      await updateOrganizationInviteStatus({
        inviteId,
        status: "revoked",
      });
      await load();
    } catch (e: any) {
      setError(e?.message ?? "Failed to revoke invite.");
    } finally {
      setInviteMutatingId((current) => (current === inviteId ? null : current));
    }
  }, [load]);

  const onResendInvite = useCallback(async (inviteId: string) => {
    try {
      setError(null);
      setInviteMutatingId(inviteId);
      await resendOrganizationInvite({ inviteId });
      await load();
    } catch (e: any) {
      setError(e?.message ?? "Failed to resend invite.");
    } finally {
      setInviteMutatingId((current) => (current === inviteId ? null : current));
    }
  }, [load]);

  const onToggleMemberStatus = useCallback(async (member: OrganizationMemberContact) => {
    if (member.role === "org_owner") {
      return;
    }

    const nextStatus = member.status === "active" ? "disabled" : "active";

    try {
      setError(null);
      setMemberMutatingId(member.id);
      await updateOrganizationMemberStatus({
        memberId: member.id,
        status: nextStatus,
      });
      await load();
    } catch (e: any) {
      setError(e?.message ?? "Failed to update member status.");
    } finally {
      setMemberMutatingId((current) => (current === member.id ? null : current));
    }
  }, [load]);

  const onCreateTeam = useCallback(async () => {
    if (!currentOrganization?.id || !user?.id) {
      setError("Missing organization or user context.");
      return;
    }

    try {
      setTeamSaving(true);
      setError(null);
      const createdTeam = await createTeam({
        organizationId: currentOrganization.id,
        name: teamName,
        description: teamDescription,
        createdBy: user.id,
      });
      setTeamName("");
      setTeamDescription("");
      setExpandedTeamId(createdTeam.id);
      setTeamDraftName(createdTeam.name);
      setTeamDraftDescription(createdTeam.description ?? "");
      setTeamMemberSelection([]);
      await load();
    } catch (e: any) {
      setError(e?.message ?? "Failed to create team.");
    } finally {
      setTeamSaving(false);
    }
  }, [currentOrganization?.id, load, teamDescription, teamName, user?.id]);

  const toggleTeamExpanded = useCallback((team: TeamWithMembers) => {
    setExpandedTeamId((current) => {
      if (current === team.id) {
        return null;
      }

      setTeamDraftName(team.name);
      setTeamDraftDescription(team.description ?? "");
      setTeamMemberSelection(team.members.map((member) => member.userId));
      return team.id;
    });
  }, []);

  const onToggleTeamMember = useCallback((userId: string) => {
    setTeamMemberSelection((current) =>
      current.includes(userId)
        ? current.filter((value) => value !== userId)
        : [...current, userId]
    );
  }, []);

  const onSaveTeam = useCallback(async (team: TeamWithMembers) => {
    try {
      setError(null);
      setTeamMutatingId(team.id);
      await updateTeam({
        teamId: team.id,
        name: teamDraftName,
        description: teamDraftDescription,
      });
      await setTeamMembers({
        teamId: team.id,
        organizationId: team.organizationId,
        userIds: teamMemberSelection,
      });
      await load();
    } catch (e: any) {
      setError(e?.message ?? "Failed to save team.");
    } finally {
      setTeamMutatingId((current) => (current === team.id ? null : current));
    }
  }, [load, teamDraftDescription, teamDraftName, teamMemberSelection]);

  const onDeleteTeam = useCallback(async (teamId: string) => {
    try {
      setError(null);
      setTeamMutatingId(teamId);
      await deleteTeam({ teamId });
      if (expandedTeamId === teamId) {
        setExpandedTeamId(null);
      }
      await load();
    } catch (e: any) {
      setError(e?.message ?? "Failed to delete team.");
    } finally {
      setTeamMutatingId((current) => (current === teamId ? null : current));
    }
  }, [expandedTeamId, load]);

  const onDeleteAssignment = useCallback(async (assignmentId: string) => {
    try {
      setError(null);
      setAssignmentMutatingId(assignmentId);
      await deleteTrainingAssignment({ assignmentId });
      setRecipientDetails((current) => {
        const next = { ...current };
        delete next[assignmentId];
        return next;
      });
      setExpandedAssignmentId((current) => (current === assignmentId ? null : current));
      await load();
    } catch (e: any) {
      setError(e?.message ?? "Failed to delete assignment.");
    } finally {
      setAssignmentMutatingId((current) => (current === assignmentId ? null : current));
    }
  }, [load]);

  if (!currentOrganization) {
    return (
      <View style={{ ...ui.screenPadded, justifyContent: "center", gap: 12 }}>
        <Text style={theme.typography.titleLg}>Organization</Text>
        <Text style={{ color: theme.colors.muted }}>
          You do not have manager access in any cached organization yet.
        </Text>
        <Pressable
          onPress={() => router.push("/organization-create")}
          style={({ pressed }) => ({
            ...ui.buttonPrimary,
            opacity: pressed ? 0.85 : 1,
          })}
        >
          <Text style={{ color: theme.colors.textInverse, fontWeight: "700" }}>
            Create organization
          </Text>
        </Pressable>
      </View>
    );
  }

  if (!hasManagerAccess) {
    return (
      <View style={{ ...ui.screenPadded, justifyContent: "center", gap: 14 }}>
        <Text style={theme.typography.titleLg}>Organization</Text>
        <Text style={{ color: theme.colors.text, fontWeight: "700" }}>
          {currentOrganization.name}
        </Text>
        <Text style={{ color: theme.colors.muted }}>
          You are an active {formatOrganizationRole(currentOrganization.membershipRole)} in this organization.
        </Text>
        <Text style={{ color: theme.colors.muted }}>
          Manager tools such as invites, teams, and assignment rollout are only available to owners and managers. Your assigned training remains available in the Training screen.
        </Text>
        <Pressable
          onPress={goBackOrHome}
          style={({ pressed }) => ({
            ...ui.button,
            opacity: pressed ? 0.8 : 1,
          })}
        >
          <Text style={{ color: theme.colors.text, fontWeight: "700" }}>Back</Text>
        </Pressable>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={{ ...ui.screen, ...ui.centered }}>
        <ActivityIndicator />
        <Text style={{ marginTop: 8, color: theme.colors.muted }}>
          Loading organization overview...
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={ui.screen}
      contentContainerStyle={{ padding: 20, gap: 16 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={theme.typography.titleLg}>Organization</Text>
          <Text style={{ color: theme.colors.muted }}>{currentOrganization.name}</Text>
        </View>

        <View style={{ flexDirection: "row", gap: 8 }}>
          <Pressable
            onPress={goBackOrHome}
            style={({ pressed }) => ({
              ...ui.button,
              opacity: pressed ? 0.8 : 1,
              paddingVertical: 10,
              paddingHorizontal: 12,
            })}
          >
            <Ionicons name="arrow-back" size={18} />
          </Pressable>
        </View>
      </View>

      {error && <ErrorBanner message={error} />}

      <View
        style={{
          borderWidth: 1,
          borderColor: theme.colors.border,
          borderRadius: theme.radiusLg,
          backgroundColor: theme.colors.surface1,
          padding: 10,
        }}
      >
        <View style={{ flexDirection: "row", gap: 8 }}>
          {tabs.map((tab) => {
            const selected = activeTab === tab.key;

            return (
              <Pressable
                key={tab.key}
                onPress={() => setActiveTab(tab.key)}
                style={({ pressed }) => ({
                  opacity: pressed ? 0.85 : 1,
                  flex: 1,
                  minWidth: 0,
                  paddingVertical: 10,
                  paddingHorizontal: 6,
                  borderRadius: theme.radius,
                  borderWidth: 1,
                  backgroundColor: selected ? theme.colors.primaryMuted : theme.colors.surface2,
                  borderColor: selected ? theme.colors.primary : theme.colors.border,
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                })}
              >
                <Ionicons
                  name={getTabIcon(tab.key)}
                  size={18}
                  color={selected ? theme.colors.primary : theme.colors.muted}
                />
                <Text
                  style={{
                    color: selected ? theme.colors.primary : theme.colors.text,
                    fontWeight: "700",
                    fontSize: 12,
                    textAlign: "center",
                  }}
                  numberOfLines={1}
                >
                  {tab.label}
                </Text>
                <View
                  style={{
                    minWidth: 26,
                    paddingHorizontal: 6,
                    paddingVertical: 2,
                    borderRadius: 999,
                    backgroundColor: selected ? theme.colors.primary : theme.colors.cardPressed,
                    alignItems: "center",
                  }}
                >
                  <Text
                    style={{
                      color: selected ? theme.colors.textInverse : theme.colors.text,
                      fontWeight: "700",
                      fontSize: 12,
                    }}
                  >
                    {tab.count}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      </View>

      {activeTab === "people" ? (
      <View style={ui.screenSection}>
        <Text style={theme.typography.sectionTitle}>People</Text>
        <Text style={{ color: theme.colors.muted, marginTop: 4 }}>
          Review organization members and disable or re-enable access when needed.
        </Text>

        <View style={{ gap: 10, marginTop: 14 }}>
          {organizationMembers.length > 0 ? (
            organizationMembers.map((member) => {
              const isOwner = member.role === "org_owner";
              const mutating = memberMutatingId === member.id;
              const isActive = member.status === "active";

              return (
                <View
                  key={member.id}
                  style={{
                    ...ui.card,
                    padding: 12,
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                    borderColor: isActive ? theme.colors.border : theme.colors.errorBorder,
                  }}
                >
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text style={{ fontWeight: "700", color: theme.colors.text }}>
                      {formatMemberContactLabel(member)}
                    </Text>
                    <Text style={{ color: theme.colors.muted }}>
                      {formatOrganizationRole(member.role)} • {member.status}
                    </Text>
                  </View>

                  {isOwner ? (
                    <View style={ui.chip}>
                      <Text style={{ color: theme.colors.muted, fontWeight: "700" }}>Owner</Text>
                    </View>
                  ) : (
                    <Pressable
                      onPress={() => void onToggleMemberStatus(member)}
                      disabled={mutating}
                      style={({ pressed }) => ({
                        ...ui.button,
                        opacity: mutating ? 0.6 : pressed ? 0.85 : 1,
                        paddingVertical: 10,
                        paddingHorizontal: 12,
                        borderColor: isActive ? theme.colors.errorBorder : theme.colors.primary,
                        backgroundColor: isActive ? theme.colors.errorBg : theme.colors.primaryMuted,
                      })}
                    >
                      {mutating ? (
                        <ActivityIndicator />
                      ) : (
                        <Text
                          style={{
                            color: isActive ? theme.colors.error : theme.colors.primary,
                            fontWeight: "700",
                          }}
                        >
                          {isActive ? "Disable" : "Enable"}
                        </Text>
                      )}
                    </Pressable>
                  )}
                </View>
              );
            })
          ) : (
            <View style={ui.mutedPanel}>
              <Text style={{ color: theme.colors.muted }}>
                No members cached yet for this organization.
              </Text>
            </View>
          )}
        </View>
      </View>
      ) : null}

      {activeTab === "invites" ? (
      <View style={ui.screenSection}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={theme.typography.sectionTitle}>Invite People</Text>
            <Text style={{ color: theme.colors.muted }}>
              Send an in-app invite by email. The invited user can accept it from their inbox.
            </Text>
          </View>

          <Pressable
            onPress={() => router.push("/organization-invites")}
            style={({ pressed }) => ({
              ...ui.button,
              opacity: pressed ? 0.85 : 1,
              paddingVertical: 10,
              paddingHorizontal: 12,
            })}
          >
            <Text style={{ color: theme.colors.text, fontWeight: "700" }}>Inbox</Text>
          </Pressable>
        </View>

        <View style={{ gap: 12, marginTop: 14 }}>
          <TextInput
            value={inviteEmail}
            onChangeText={setInviteEmail}
            placeholder="employee@company.com"
            placeholderTextColor={theme.colors.muted}
            style={ui.input}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
          />

          <View style={{ flexDirection: "row", gap: 8 }}>
            {(["employee", "org_manager"] as OrganizationRole[]).map((role) => {
              const selected = inviteRole === role;
              return (
                <Pressable
                  key={role}
                  onPress={() => setInviteRole(role)}
                  style={({ pressed }) => ({
                    ...ui.chip,
                    opacity: pressed ? 0.85 : 1,
                    backgroundColor: selected ? theme.colors.primaryMuted : theme.colors.surface2,
                    borderColor: selected ? theme.colors.primary : theme.colors.border,
                  })}
                >
                  <Text
                    style={{
                      color: selected ? theme.colors.primary : theme.colors.text,
                      fontWeight: "700",
                    }}
                  >
                    {formatOrganizationRole(role)}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Pressable
            onPress={() => void onCreateInvite()}
            disabled={inviteSaving}
            style={({ pressed }) => ({
              ...ui.buttonPrimary,
              opacity: inviteSaving ? 0.6 : pressed ? 0.85 : 1,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
            })}
          >
            {inviteSaving ? (
              <ActivityIndicator color={theme.colors.textInverse} />
            ) : (
              <>
                <Ionicons name="mail-open-outline" size={18} color={theme.colors.textInverse} />
                <Text style={{ color: theme.colors.textInverse, fontWeight: "700" }}>
                  Send invite
                </Text>
              </>
            )}
          </Pressable>
        </View>

        <View style={{ gap: 10, marginTop: 16 }}>
          {pendingInvites.length > 0 ? (
            pendingInvites.slice(0, 6).map((invite) => (
              <View
                key={invite.id}
                style={{
                  ...ui.card,
                  padding: 12,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                }}
              >
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={{ fontWeight: "700", color: theme.colors.text }}>{invite.email}</Text>
                  <Text style={{ color: theme.colors.muted }}>
                    {formatOrganizationRole(invite.role)} invited
                  </Text>
                </View>
                <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
                  <View style={ui.chip}>
                    <Text style={{ color: theme.colors.muted, fontWeight: "700" }}>Pending</Text>
                  </View>
                  <Pressable
                    onPress={() => void onRevokeInvite(invite.id)}
                    disabled={inviteMutatingId === invite.id}
                    style={({ pressed }) => ({
                      ...ui.button,
                      opacity: inviteMutatingId === invite.id ? 0.6 : pressed ? 0.85 : 1,
                      paddingVertical: 10,
                      paddingHorizontal: 12,
                      borderColor: theme.colors.errorBorder,
                      backgroundColor: theme.colors.errorBg,
                    })}
                  >
                    {inviteMutatingId === invite.id ? (
                      <ActivityIndicator />
                    ) : (
                      <Text style={{ color: theme.colors.error, fontWeight: "700" }}>Revoke</Text>
                    )}
                  </Pressable>
                </View>
              </View>
            ))
          ) : (
            <View style={ui.mutedPanel}>
              <Text style={{ color: theme.colors.muted }}>
                No pending invites yet for this organization.
              </Text>
            </View>
          )}
        </View>

        {recentResolvedInvites.length > 0 && (
          <View style={{ gap: 10, marginTop: 16 }}>
            <Pressable
              onPress={() => setShowInviteHistory((current) => !current)}
              style={({ pressed }) => ({
                ...ui.button,
                opacity: pressed ? 0.85 : 1,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                paddingVertical: 12,
                paddingHorizontal: 14,
              })}
            >
              <View style={{ gap: 2 }}>
                <Text style={{ fontWeight: "700", color: theme.colors.text }}>Recent invite history</Text>
                <Text style={{ color: theme.colors.muted }}>
                  {recentResolvedInvites.length} recent resolved invite{recentResolvedInvites.length === 1 ? "" : "s"}
                </Text>
              </View>
              <Ionicons
                name={showInviteHistory ? "chevron-up" : "chevron-down"}
                size={18}
                color={theme.colors.muted}
              />
            </Pressable>

            {showInviteHistory && recentResolvedInvites.map((invite) => {
              const canResend = invite.status === "revoked" || invite.status === "expired";
              const mutating = inviteMutatingId === invite.id;

              return (
                <View
                  key={invite.id}
                  style={{
                    ...ui.card,
                    padding: 12,
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                  }}
                >
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text style={{ fontWeight: "700", color: theme.colors.text }}>{invite.email}</Text>
                    <Text style={{ color: theme.colors.muted }}>
                      {formatOrganizationRole(invite.role)} • {invite.status}
                    </Text>
                  </View>

                  {canResend ? (
                    <Pressable
                      onPress={() => void onResendInvite(invite.id)}
                      disabled={mutating}
                      style={({ pressed }) => ({
                        ...ui.button,
                        opacity: mutating ? 0.6 : pressed ? 0.85 : 1,
                        paddingVertical: 10,
                        paddingHorizontal: 12,
                        borderColor: theme.colors.primary,
                        backgroundColor: theme.colors.primaryMuted,
                      })}
                    >
                      {mutating ? (
                        <ActivityIndicator />
                      ) : (
                        <Text style={{ color: theme.colors.primary, fontWeight: "700" }}>Resend</Text>
                      )}
                    </Pressable>
                  ) : (
                    <View style={ui.chip}>
                      <Text style={{ color: theme.colors.muted, fontWeight: "700" }}>
                        {invite.status}
                      </Text>
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        )}
      </View>
      ) : null}

      {activeTab === "teams" ? (
      <View style={ui.screenSection}>
        <Text style={theme.typography.sectionTitle}>Teams</Text>
        <Text style={{ color: theme.colors.muted, marginTop: 4 }}>
          Create teams and choose exactly which active members belong to each team.
        </Text>

        <View style={{ gap: 12, marginTop: 14 }}>
          <TextInput
            value={teamName}
            onChangeText={setTeamName}
            placeholder="Team name"
            placeholderTextColor={theme.colors.muted}
            style={ui.input}
          />
          <TextInput
            value={teamDescription}
            onChangeText={setTeamDescription}
            placeholder="Description (optional)"
            placeholderTextColor={theme.colors.muted}
            style={[ui.input, { minHeight: 80, textAlignVertical: "top" }]}
            multiline
          />
          <Pressable
            onPress={() => void onCreateTeam()}
            disabled={teamSaving}
            style={({ pressed }) => ({
              ...ui.buttonPrimary,
              opacity: teamSaving ? 0.6 : pressed ? 0.85 : 1,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
            })}
          >
            {teamSaving ? (
              <ActivityIndicator color={theme.colors.textInverse} />
            ) : (
              <>
                <Ionicons name="people-outline" size={18} color={theme.colors.textInverse} />
                <Text style={{ color: theme.colors.textInverse, fontWeight: "700" }}>
                  Create team
                </Text>
              </>
            )}
          </Pressable>
        </View>

        <View style={{ gap: 10, marginTop: 14 }}>
          {teams.length > 0 ? (
            teams.map((team) => {
              const expanded = expandedTeamId === team.id;
              const mutating = teamMutatingId === team.id;

              return (
              <View
                key={team.id}
                style={{
                  ...ui.cardElevated,
                  padding: 12,
                  gap: 12,
                }}
              >
                <Pressable
                  onPress={() => toggleTeamExpanded(team)}
                  style={({ pressed }) => ({
                    opacity: pressed ? 0.85 : 1,
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                  })}
                >
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text style={{ fontWeight: "700", color: theme.colors.text }}>{team.name}</Text>
                    <Text style={{ color: theme.colors.muted }}>{team.members.length} members</Text>
                    {!!team.description && (
                      <Text style={{ color: theme.colors.muted }}>{team.description}</Text>
                    )}
                  </View>
                  <Ionicons
                    name={expanded ? "chevron-up" : "chevron-down"}
                    size={20}
                    color={theme.colors.muted}
                  />
                </Pressable>

                {expanded && (
                  <View style={{ gap: 12 }}>
                    <TextInput
                      value={teamDraftName}
                      onChangeText={setTeamDraftName}
                      placeholder="Team name"
                      placeholderTextColor={theme.colors.muted}
                      style={ui.input}
                    />
                    <TextInput
                      value={teamDraftDescription}
                      onChangeText={setTeamDraftDescription}
                      placeholder="Description (optional)"
                      placeholderTextColor={theme.colors.muted}
                      style={[ui.input, { minHeight: 80, textAlignVertical: "top" }]}
                      multiline
                    />

                    <View style={{ gap: 8 }}>
                      <Text style={{ fontWeight: "700", color: theme.colors.text }}>Members</Text>
                      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                        {activeMemberOptions.map((member) => {
                          const selected = teamMemberSelection.includes(member.userId);
                          return (
                            <Pressable
                              key={member.userId}
                              onPress={() => onToggleTeamMember(member.userId)}
                              style={({ pressed }) => ({
                                ...ui.chip,
                                opacity: pressed ? 0.85 : 1,
                                backgroundColor: selected ? theme.colors.primaryMuted : theme.colors.surface2,
                                borderColor: selected ? theme.colors.primary : theme.colors.border,
                              })}
                            >
                              <Text
                                style={{
                                  color: selected ? theme.colors.primary : theme.colors.text,
                                  fontWeight: "700",
                                }}
                              >
                                {formatMemberContactLabel(member)}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    </View>

                    <View style={{ flexDirection: "row", gap: 8 }}>
                      <Pressable
                        onPress={() => void onSaveTeam(team)}
                        disabled={mutating}
                        style={({ pressed }) => ({
                          ...ui.buttonPrimary,
                          opacity: mutating ? 0.6 : pressed ? 0.85 : 1,
                          flex: 1,
                        })}
                      >
                        {mutating ? (
                          <ActivityIndicator color={theme.colors.textInverse} />
                        ) : (
                          <Text style={{ color: theme.colors.textInverse, fontWeight: "700" }}>
                            Save team
                          </Text>
                        )}
                      </Pressable>

                      <Pressable
                        onPress={() => void onDeleteTeam(team.id)}
                        disabled={mutating}
                        style={({ pressed }) => ({
                          ...ui.button,
                          opacity: mutating ? 0.6 : pressed ? 0.85 : 1,
                          borderColor: theme.colors.errorBorder,
                          backgroundColor: theme.colors.errorBg,
                        })}
                      >
                        <Text style={{ color: theme.colors.error, fontWeight: "700" }}>
                          Delete
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                )}
                </View>
            );
            })
          ) : (
            <View style={ui.mutedPanel}>
              <Text style={{ color: theme.colors.muted }}>
                No teams yet for this organization.
              </Text>
            </View>
          )}
        </View>
      </View>
      ) : null}

      {activeTab === "assignments" ? (
      <View style={ui.screenSection}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={theme.typography.sectionTitle}>Active assignments</Text>
            <Text style={{ color: theme.colors.muted }}>
              Manager view over assigned training rollout.
            </Text>
          </View>

          <Pressable
            onPress={() =>
              router.push({
                pathname: "/organization-create-assignment",
                params: { organizationId: currentOrganization.id },
              })
            }
            style={({ pressed }) => ({
              ...ui.buttonPrimary,
              opacity: pressed ? 0.85 : 1,
              paddingVertical: 10,
              paddingHorizontal: 12,
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
            })}
          >
            <Ionicons name="add" size={18} color={theme.colors.textInverse} />
            <Text style={{ color: theme.colors.textInverse, fontWeight: "700" }}>Create</Text>
          </Pressable>
        </View>

        <View style={{ gap: 12, marginTop: 14 }}>
          {assignments.length > 0 ? (
            assignments.map((assignment) => {
              const dueLabel = formatDueDate(assignment.dueAt);
              const isExpanded = expandedAssignmentId === assignment.id;
              const detailRows = recipientDetails[assignment.id] ?? [];
              const deleting = assignmentMutatingId === assignment.id;
              return (
                <View
                  key={assignment.id}
                  style={{
                    ...ui.cardElevated,
                    padding: 14,
                    gap: 10,
                    borderColor:
                      assignment.overdueCount > 0
                        ? theme.colors.errorBorder
                        : assignment.completedCount === assignment.recipientCount && assignment.recipientCount > 0
                          ? theme.colors.success
                          : theme.colors.border,
                  }}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "flex-start",
                      justifyContent: "space-between",
                      gap: 12,
                    }}
                  >
                    <View style={{ flex: 1, gap: 4 }}>
                      <Text style={{ fontWeight: "700", fontSize: 16, color: theme.colors.text }}>
                        {assignment.title?.trim() || assignment.lessonTitle || "Untitled assignment"}
                      </Text>
                      <Text style={{ color: theme.colors.muted }}>
                        Training: {assignment.lessonTitle ?? assignment.lessonId}
                      </Text>
                    </View>

                    {dueLabel && (
                      <View style={ui.chip}>
                        <Text style={{ color: theme.colors.muted, fontWeight: "600" }}>
                          Due {dueLabel}
                        </Text>
                      </View>
                    )}
                  </View>

                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                    <View style={ui.chip}>
                      <Text style={{ color: theme.colors.text, fontWeight: "700" }}>
                        {assignment.recipientCount} assigned
                      </Text>
                    </View>
                    <View style={{ ...ui.chip, backgroundColor: theme.colors.successBg, borderColor: theme.colors.success }}>
                      <Text style={{ color: theme.colors.success, fontWeight: "700" }}>
                        {assignment.completedCount} completed
                      </Text>
                    </View>
                    <View style={{ ...ui.chip, backgroundColor: theme.colors.primaryMuted, borderColor: theme.colors.primary }}>
                      <Text style={{ color: theme.colors.primary, fontWeight: "700" }}>
                        {assignment.inProgressCount} in progress
                      </Text>
                    </View>
                    {assignment.overdueCount > 0 && (
                      <View style={{ ...ui.chip, backgroundColor: theme.colors.errorBg, borderColor: theme.colors.errorBorder }}>
                        <Text style={{ color: theme.colors.error, fontWeight: "700" }}>
                          {assignment.overdueCount} overdue
                        </Text>
                      </View>
                    )}
                  </View>

                  <Pressable
                    onPress={() => void toggleAssignmentDetails(assignment.id)}
                    disabled={deleting}
                    style={({ pressed }) => ({
                      ...ui.button,
                      opacity: deleting ? 0.6 : pressed ? 0.85 : 1,
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                    })}
                  >
                    <Text style={{ color: theme.colors.text, fontWeight: "700" }}>
                      {isExpanded ? "Hide people" : "View people and progress"}
                    </Text>
                    <Ionicons
                      name={isExpanded ? "chevron-up" : "chevron-down"}
                      size={18}
                      color={theme.colors.muted}
                    />
                  </Pressable>

                  <Pressable
                    onPress={() => void onDeleteAssignment(assignment.id)}
                    disabled={deleting}
                    style={({ pressed }) => ({
                      ...ui.button,
                      opacity: deleting ? 0.6 : pressed ? 0.85 : 1,
                      borderColor: theme.colors.errorBorder,
                      backgroundColor: theme.colors.errorBg,
                      alignItems: "center",
                    })}
                  >
                    {deleting ? (
                      <ActivityIndicator />
                    ) : (
                      <Text style={{ color: theme.colors.error, fontWeight: "700" }}>
                        Delete assignment
                      </Text>
                    )}
                  </Pressable>

                  {isExpanded && (
                    <View style={{ gap: 10 }}>
                      {recipientLoadingId === assignment.id ? (
                        <View style={{ ...ui.mutedPanel, alignItems: "center", gap: 8 }}>
                          <ActivityIndicator />
                          <Text style={{ color: theme.colors.muted }}>
                            Loading people...
                          </Text>
                        </View>
                      ) : detailRows.length > 0 ? (
                        detailRows.map((recipient) => {
                          const tone = getRecipientTone(recipient.status);
                          return (
                            <View
                              key={recipient.id}
                              style={{
                                ...ui.card,
                                padding: 12,
                                gap: 10,
                                borderColor: tone.border,
                              }}
                            >
                              <View
                                style={{
                                  flexDirection: "row",
                                  alignItems: "flex-start",
                                  justifyContent: "space-between",
                                  gap: 12,
                                }}
                              >
                                <View style={{ flex: 1, gap: 4 }}>
                                  <Text style={{ fontWeight: "700", color: theme.colors.text }}>
                                    {formatIdentityLabel(recipient.email, recipient.userId)}
                                  </Text>
                                  <Text style={{ color: theme.colors.muted }}>
                                    {formatMemberRole(recipient.memberRole)}
                                  </Text>
                                </View>

                                <View
                                  style={{
                                    ...ui.chip,
                                    borderColor: tone.border,
                                    backgroundColor: tone.bg,
                                  }}
                                >
                                  <Text style={{ color: tone.text, fontWeight: "700" }}>
                                    {tone.label}
                                  </Text>
                                </View>
                              </View>

                              <View style={{ gap: 6 }}>
                                <View
                                  style={{
                                    flexDirection: "row",
                                    justifyContent: "space-between",
                                    alignItems: "center",
                                  }}
                                >
                                  <Text style={{ color: theme.colors.muted, fontSize: 12, fontWeight: "700" }}>
                                    PROGRESS
                                  </Text>
                                  <Text style={{ color: theme.colors.text, fontWeight: "700" }}>
                                    {recipient.completion}%
                                  </Text>
                                </View>
                                <ProgressBar value={recipient.completion} />
                              </View>
                            </View>
                          );
                        })
                      ) : (
                        <View style={ui.mutedPanel}>
                          <Text style={{ color: theme.colors.muted }}>
                            No recipients cached for this assignment yet.
                          </Text>
                        </View>
                      )}
                    </View>
                  )}
                </View>
              );
            })
          ) : (
            <View style={ui.mutedPanel}>
              <Text style={{ color: theme.colors.muted }}>
                No assignments cached yet. Once the organization creates assignments, they will appear here.
              </Text>
            </View>
          )}
        </View>
      </View>
      ) : null}
    </ScrollView>
  );
}