import { v4 as uuid } from "uuid";

import { execute } from "../db";
import { supabase } from "../auth/supabase";
import { withAuditEvent } from "../observability/audit";
import type {
  AssignmentRecipient,
  AssignmentRecipientStatus,
  Organization,
  OrganizationInvite,
  OrganizationMember,
  Team,
  TeamMember,
  TrainingAssignment,
  SyncCursor,
  SyncOutboxItem,
} from "../types/models";

export type OrganizationWithMembership = Organization & {
  membershipRole: OrganizationMember["role"];
  membershipStatus: OrganizationMember["status"];
  membershipJoinedAt?: number | null;
};

export type PendingOrganizationInvite = OrganizationInvite & {
  organizationName: string;
};

export type InboxNotification = {
  id: string;
  userId: string;
  organizationId?: string | null;
  kind: "assignment_completed";
  title: string;
  body?: string | null;
  referenceType?: string | null;
  referenceId?: string | null;
  metadata: Record<string, unknown>;
  createdAt: number;
};

function slugifyOrganizationName(name: string) {
  const base = name
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);

  return base || "organization";
}

function normalizeInviteEmail(email: string) {
  return email.trim().toLowerCase();
}

function mapRemoteInvite(row: any): OrganizationInvite {
  return {
    id: row.id,
    organizationId: row.organization_id,
    email: row.email,
    role: row.role,
    invitedBy: row.invited_by,
    token: row.token,
    status: row.status,
    expiresAt: row.expires_at ? Date.parse(row.expires_at) : null,
    acceptedAt: row.accepted_at ? Date.parse(row.accepted_at) : null,
    createdAt: row.created_at ? Date.parse(row.created_at) : Date.now(),
    updatedAt: row.updated_at ? Date.parse(row.updated_at) : Date.now(),
    pendingSync: 0,
  };
}

export async function getOrganizationsForUser(
  userId: string
): Promise<OrganizationWithMembership[]> {
  const res = await execute(
    `
    SELECT
      o.*,
      om.role as membershipRole,
      om.status as membershipStatus,
      om.joinedAt as membershipJoinedAt
    FROM Organization o
    JOIN OrganizationMember om ON om.organizationId = o.id
    WHERE om.userId=?
    ORDER BY o.name COLLATE NOCASE ASC
    `,
    [userId]
  );

  return res.rows as OrganizationWithMembership[];
}

export async function getOrganizationById(
  organizationId: string
): Promise<Organization | null> {
  const res = await execute(
    `SELECT * FROM Organization WHERE id=? LIMIT 1`,
    [organizationId]
  );
  return (res.rows?.[0] as Organization) ?? null;
}

export async function createOrganization(input: {
  name: string;
  createdBy: string;
}): Promise<{ organization: Organization; membership: OrganizationMember }> {
  const now = Date.now();
  const organizationId = uuid();
  const organization: Organization = {
    id: organizationId,
    name: input.name.trim(),
    slug: `${slugifyOrganizationName(input.name)}-${organizationId.slice(0, 6)}`,
    createdBy: input.createdBy,
    createdAt: now,
    updatedAt: now,
    archivedAt: null,
    pendingSync: 0,
  };

  const membership: OrganizationMember = {
    id: uuid(),
    organizationId,
    userId: input.createdBy,
    role: "org_owner",
    status: "active",
    joinedAt: now,
    createdAt: now,
    updatedAt: now,
    pendingSync: 0,
  };

  return withAuditEvent(
    {
      actorUserId: input.createdBy,
      organizationId: organizationId,
      category: "audit",
      action: "organization_created",
      targetType: "organization",
      targetId: organizationId,
      metadata: { slug: organization.slug },
    },
    async () => {
      const { error: organizationError } = await supabase.from("organizations").insert({
        id: organization.id,
        name: organization.name,
        slug: organization.slug,
        created_by: organization.createdBy,
      });

      if (organizationError) {
        throw organizationError;
      }

      const { error: memberError } = await supabase.from("organization_members").insert({
        id: membership.id,
        organization_id: membership.organizationId,
        user_id: membership.userId,
        role: membership.role,
        status: membership.status,
        joined_at: new Date(now).toISOString(),
      });

      if (memberError) {
        await supabase.from("organizations").delete().eq("id", organization.id);
        throw memberError;
      }

      await cacheOrganizations([organization]);
      await cacheOrganizationMembers([membership]);

      return { organization, membership };
    }
  );
}

export async function createOrganizationInvite(input: {
  organizationId: string;
  email: string;
  role: OrganizationMember["role"];
  invitedBy: string;
  expiresInDays?: number;
}): Promise<OrganizationInvite> {
  const now = Date.now();
  const normalizedEmail = normalizeInviteEmail(input.email);

  if (!normalizedEmail || !normalizedEmail.includes("@")) {
    throw new Error("Enter a valid email address.");
  }

  const { data: existingInvite, error: existingInviteError } = await supabase
    .from("organization_invites")
    .select("id")
    .eq("organization_id", input.organizationId)
    .eq("email", normalizedEmail)
    .eq("status", "pending")
    .limit(1)
    .maybeSingle();

  if (existingInviteError) {
    throw existingInviteError;
  }

  if (existingInvite) {
    throw new Error("There is already a pending invite for this email.");
  }

  const invite: OrganizationInvite = {
    id: uuid(),
    organizationId: input.organizationId,
    email: normalizedEmail,
    role: input.role,
    invitedBy: input.invitedBy,
    token: uuid(),
    status: "pending",
    expiresAt: now + (input.expiresInDays ?? 7) * 24 * 60 * 60 * 1000,
    acceptedAt: null,
    createdAt: now,
    updatedAt: now,
    pendingSync: 0,
  };

  return withAuditEvent(
    {
      actorUserId: input.invitedBy,
      organizationId: input.organizationId,
      category: "audit",
      action: "invite_created",
      targetType: "organization_invite",
      targetId: invite.id,
      metadata: { role: input.role },
    },
    async () => {
      const { error } = await supabase.from("organization_invites").insert({
        id: invite.id,
        organization_id: invite.organizationId,
        email: invite.email,
        role: invite.role,
        invited_by: invite.invitedBy,
        token: invite.token,
        status: invite.status,
        expires_at: invite.expiresAt ? new Date(invite.expiresAt).toISOString() : null,
        accepted_at: null,
      });

      if (error) {
        throw error;
      }

      await cacheOrganizationInvites([invite]);

      return invite;
    }
  );
}

export async function listMyPendingOrganizationInvites(): Promise<PendingOrganizationInvite[]> {
  const { data, error } = await supabase.rpc("list_my_organization_invites");

  if (error) {
    throw error;
  }

  return (data ?? []).map((row: any) => ({
    ...mapRemoteInvite(row),
    organizationName: row.organization_name,
  }));
}

export async function listMyInboxNotifications(limit = 20): Promise<InboxNotification[]> {
  const { data, error } = await supabase
    .from("user_inbox_notifications")
    .select("id, user_id, organization_id, kind, title, body, reference_type, reference_id, metadata, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw error;
  }

  return (data ?? []).map((row: any) => ({
    id: String(row.id),
    userId: String(row.user_id),
    organizationId: row.organization_id ? String(row.organization_id) : null,
    kind: row.kind,
    title: String(row.title ?? ""),
    body: row.body ? String(row.body) : null,
    referenceType: row.reference_type ? String(row.reference_type) : null,
    referenceId: row.reference_id ? String(row.reference_id) : null,
    metadata: row.metadata && typeof row.metadata === "object" ? row.metadata : {},
    createdAt: row.created_at ? Date.parse(row.created_at) : Date.now(),
  }));
}

export async function acceptOrganizationInvite(input: { token: string }): Promise<void> {
  const { error } = await supabase.rpc("accept_organization_invite", {
    invite_token: input.token,
  });

  if (error) {
    throw error;
  }
}

export async function updateOrganizationInviteStatus(input: {
  inviteId: string;
  status: OrganizationInvite["status"];
}): Promise<void> {
  await withAuditEvent(
    {
      category: "audit",
      action: input.status === "revoked" ? "invite_revoked" : "invite_status_updated",
      targetType: "organization_invite",
      targetId: input.inviteId,
      metadata: { status: input.status },
    },
    async () => {
      const { data, error } = await supabase
        .from("organization_invites")
        .update({ status: input.status })
        .eq("id", input.inviteId)
        .select("id, organization_id, email, role, invited_by, token, status, expires_at, accepted_at, created_at, updated_at")
        .single();

      if (error) {
        throw error;
      }

      await cacheOrganizationInvites([
        {
          id: data.id,
          organizationId: data.organization_id,
          email: data.email,
          role: data.role,
          invitedBy: data.invited_by,
          token: data.token,
          status: data.status,
          expiresAt: data.expires_at ? Date.parse(data.expires_at) : null,
          acceptedAt: data.accepted_at ? Date.parse(data.accepted_at) : null,
          createdAt: Date.parse(data.created_at),
          updatedAt: Date.parse(data.updated_at),
          pendingSync: 0,
        },
      ]);
    }
  );
}

export async function resendOrganizationInvite(input: {
  inviteId: string;
  expiresInDays?: number;
}): Promise<void> {
  const now = Date.now();
  await withAuditEvent(
    {
      category: "audit",
      action: "invite_resent",
      targetType: "organization_invite",
      targetId: input.inviteId,
      metadata: { expiresInDays: input.expiresInDays ?? 7 },
    },
    async () => {
      const { data, error } = await supabase
        .from("organization_invites")
        .update({
          status: "pending",
          token: uuid(),
          accepted_at: null,
          expires_at: new Date(now + (input.expiresInDays ?? 7) * 24 * 60 * 60 * 1000).toISOString(),
        })
        .eq("id", input.inviteId)
        .select("id, organization_id, email, role, invited_by, token, status, expires_at, accepted_at, created_at, updated_at")
        .single();

      if (error) {
        throw error;
      }

      await cacheOrganizationInvites([
        {
          id: data.id,
          organizationId: data.organization_id,
          email: data.email,
          role: data.role,
          invitedBy: data.invited_by,
          token: data.token,
          status: data.status,
          expiresAt: data.expires_at ? Date.parse(data.expires_at) : null,
          acceptedAt: data.accepted_at ? Date.parse(data.accepted_at) : null,
          createdAt: Date.parse(data.created_at),
          updatedAt: Date.parse(data.updated_at),
          pendingSync: 0,
        },
      ]);
    }
  );
}

export async function updateOrganizationMemberStatus(input: {
  memberId: string;
  status: OrganizationMember["status"];
}): Promise<void> {
  await withAuditEvent(
    {
      category: "audit",
      action: input.status === "disabled" ? "member_disabled" : "member_enabled",
      targetType: "organization_member",
      targetId: input.memberId,
      metadata: { status: input.status },
    },
    async () => {
      const { data, error } = await supabase
        .from("organization_members")
        .update({ status: input.status })
        .eq("id", input.memberId)
        .select("id, organization_id, user_id, role, status, joined_at, created_at, updated_at")
        .single();

      if (error) {
        throw error;
      }

      await cacheOrganizationMembers([
        {
          id: data.id,
          organizationId: data.organization_id,
          userId: data.user_id,
          role: data.role,
          status: data.status,
          joinedAt: data.joined_at ? Date.parse(data.joined_at) : null,
          createdAt: Date.parse(data.created_at),
          updatedAt: Date.parse(data.updated_at),
          pendingSync: 0,
        },
      ]);
    }
  );
}

export async function getOrganizationMembers(
  organizationId: string
): Promise<OrganizationMember[]> {
  const res = await execute(
    `
    SELECT *
    FROM OrganizationMember
    WHERE organizationId=?
    ORDER BY role ASC, createdAt ASC
    `,
    [organizationId]
  );
  return res.rows as OrganizationMember[];
}

export async function getOrganizationMembersWithProfiles(
  organizationId: string
): Promise<OrganizationMemberContact[]> {
  const res = await execute(
    `
    SELECT
      om.*,
      up.email as email
    FROM OrganizationMember om
    LEFT JOIN UserProfile up ON up.userId = om.userId
    WHERE om.organizationId=?
    ORDER BY om.role ASC, om.createdAt ASC
    `,
    [organizationId]
  );
  return res.rows as OrganizationMemberContact[];
}

export async function getTeamsForOrganization(
  organizationId: string
): Promise<Team[]> {
  const res = await execute(
    `
    SELECT *
    FROM Team
    WHERE organizationId=?
    ORDER BY name COLLATE NOCASE ASC
    `,
    [organizationId]
  );
  return res.rows as Team[];
}

export async function getTeamMembers(teamId: string): Promise<TeamMember[]> {
  const res = await execute(
    `
    SELECT *
    FROM TeamMember
    WHERE teamId=?
    ORDER BY createdAt ASC
    `,
    [teamId]
  );
  return res.rows as TeamMember[];
}

export async function createTeam(input: {
  organizationId: string;
  name: string;
  description?: string | null;
  createdBy: string;
}): Promise<Team> {
  const now = Date.now();
  const team: Team = {
    id: uuid(),
    organizationId: input.organizationId,
    name: input.name.trim(),
    description: input.description?.trim() ? input.description.trim() : null,
    createdBy: input.createdBy,
    createdAt: now,
    updatedAt: now,
    archivedAt: null,
    pendingSync: 0,
  };

  if (team.name.length < 2) {
    throw new Error("Team name must have at least 2 characters.");
  }

  return withAuditEvent(
    {
      actorUserId: input.createdBy,
      organizationId: input.organizationId,
      category: "audit",
      action: "team_created",
      targetType: "team",
      targetId: team.id,
    },
    async () => {
      const { error } = await supabase.from("teams").insert({
        id: team.id,
        organization_id: team.organizationId,
        name: team.name,
        description: team.description,
        created_by: team.createdBy,
      });

      if (error) {
        throw error;
      }

      await cacheTeams([team]);
      return team;
    }
  );
}

export async function updateTeam(input: {
  teamId: string;
  name: string;
  description?: string | null;
}): Promise<void> {
  const trimmedName = input.name.trim();
  const trimmedDescription = input.description?.trim() ? input.description.trim() : null;

  if (trimmedName.length < 2) {
    throw new Error("Team name must have at least 2 characters.");
  }

  await withAuditEvent(
    {
      category: "audit",
      action: "team_updated",
      targetType: "team",
      targetId: input.teamId,
    },
    async () => {
      const { data, error } = await supabase
        .from("teams")
        .update({
          name: trimmedName,
          description: trimmedDescription,
        })
        .eq("id", input.teamId)
        .select("id, organization_id, name, description, created_by, created_at, updated_at, archived_at")
        .single();

      if (error) {
        throw error;
      }

      await cacheTeams([
        {
          id: data.id,
          organizationId: data.organization_id,
          name: data.name,
          description: data.description,
          createdBy: data.created_by,
          createdAt: Date.parse(data.created_at),
          updatedAt: Date.parse(data.updated_at),
          archivedAt: data.archived_at ? Date.parse(data.archived_at) : null,
          pendingSync: 0,
        },
      ]);
    }
  );
}

export async function deleteTeam(input: { teamId: string }): Promise<void> {
  await withAuditEvent(
    {
      category: "audit",
      action: "team_deleted",
      targetType: "team",
      targetId: input.teamId,
    },
    async () => {
      const { error } = await supabase.from("teams").delete().eq("id", input.teamId);

      if (error) {
        throw error;
      }

      await execute(`DELETE FROM TeamMember WHERE teamId=?`, [input.teamId]);
      await execute(`DELETE FROM Team WHERE id=?`, [input.teamId]);
    }
  );
}

export async function setTeamMembers(input: {
  teamId: string;
  organizationId: string;
  userIds: string[];
}): Promise<TeamMember[]> {
  const nextUserIds = Array.from(new Set(input.userIds.filter(Boolean)));
  const existingMembers = await getTeamMembers(input.teamId);
  const existingUserIds = new Set(existingMembers.map((member) => member.userId));

  const userIdsToAdd = nextUserIds.filter((userId) => !existingUserIds.has(userId));
  const userIdsToRemove = existingMembers
    .filter((member) => !nextUserIds.includes(member.userId))
    .map((member) => member.userId);

  return withAuditEvent(
    {
      organizationId: input.organizationId,
      category: "audit",
      action: "team_members_updated",
      targetType: "team",
      targetId: input.teamId,
      metadata: {
        nextMemberCount: nextUserIds.length,
        addedCount: userIdsToAdd.length,
        removedCount: userIdsToRemove.length,
      },
    },
    async () => {
      if (userIdsToAdd.length) {
        const rows = userIdsToAdd.map((userId) => ({
          id: uuid(),
          team_id: input.teamId,
          organization_id: input.organizationId,
          user_id: userId,
        }));

        const { error } = await supabase.from("team_members").insert(rows);

        if (error) {
          throw error;
        }
      }

      if (userIdsToRemove.length) {
        const { error } = await supabase
          .from("team_members")
          .delete()
          .eq("team_id", input.teamId)
          .in("user_id", userIdsToRemove);

        if (error) {
          throw error;
        }
      }

      const refreshedMembers = await (async () => {
        const { data, error } = await supabase
          .from("team_members")
          .select("id, team_id, organization_id, user_id, created_at")
          .eq("team_id", input.teamId);

        if (error) {
          throw error;
        }

        return (data ?? []).map((row) => ({
          id: row.id,
          teamId: row.team_id,
          organizationId: row.organization_id,
          userId: row.user_id,
          createdAt: Date.parse(row.created_at),
          pendingSync: 0 as const,
        }));
      })();

      await execute(`DELETE FROM TeamMember WHERE teamId=?`, [input.teamId]);
      await cacheTeamMembers(refreshedMembers);

      return refreshedMembers;
    }
  );
}

export async function getInvitesForOrganization(
  organizationId: string
): Promise<OrganizationInvite[]> {
  const res = await execute(
    `
    SELECT *
    FROM OrganizationInvite
    WHERE organizationId=?
    ORDER BY createdAt DESC
    `,
    [organizationId]
  );
  return res.rows as OrganizationInvite[];
}

export async function getAssignmentsForOrganization(
  organizationId: string
): Promise<TrainingAssignment[]> {
  const res = await execute(
    `
    SELECT *
    FROM TrainingAssignment
    WHERE organizationId=?
    ORDER BY createdAt DESC
    `,
    [organizationId]
  );
  return res.rows as TrainingAssignment[];
}

export async function getAssignmentRecipientStatsMap(
  organizationId: string
): Promise<Record<string, { total: number; completed: number; inProgress: number; overdue: number }>> {
  const res = await execute(
    `
    SELECT
      assignmentId,
      status,
      COUNT(*) as count
    FROM AssignmentRecipient
    WHERE organizationId=?
    GROUP BY assignmentId, status
    `,
    [organizationId]
  );

  const map: Record<string, { total: number; completed: number; inProgress: number; overdue: number }> = {};

  res.rows.forEach((row: any) => {
    const assignmentId = String(row.assignmentId);
    const status = String(row.status);
    const count = Number(row.count ?? 0);

    if (!map[assignmentId]) {
      map[assignmentId] = {
        total: 0,
        completed: 0,
        inProgress: 0,
        overdue: 0,
      };
    }

    map[assignmentId].total += count;
    if (status === "completed") map[assignmentId].completed += count;
    if (status === "in_progress") map[assignmentId].inProgress += count;
    if (status === "overdue") map[assignmentId].overdue += count;
  });

  return map;
}

export async function getAssignmentsForUser(
  userId: string
): Promise<Array<AssignmentRecipient & { assignmentTitle?: string | null }>> {
  const res = await execute(
    `
    SELECT
      ar.*,
      ta.title as assignmentTitle
    FROM AssignmentRecipient ar
    JOIN TrainingAssignment ta ON ta.id = ar.assignmentId
    WHERE ar.userId=?
    ORDER BY ar.assignedAt DESC
    `,
    [userId]
  );
  return res.rows as Array<AssignmentRecipient & { assignmentTitle?: string | null }>;
}

export type AssignmentRecipientDetails = AssignmentRecipient & {
  assignmentTitle?: string | null;
  assignmentNote?: string | null;
  organizationName?: string | null;
};

export type AssignmentRecipientProgressDetails = AssignmentRecipient & {
  memberRole?: OrganizationMember["role"] | null;
  memberStatus?: OrganizationMember["status"] | null;
  email?: string | null;
  completion: number;
};

export type OrganizationMemberContact = OrganizationMember & {
  email?: string | null;
};

export async function getAssignmentRecipientById(
  assignmentRecipientId: string
): Promise<AssignmentRecipientDetails | null> {
  const res = await execute(
    `
    SELECT
      ar.*,
      ta.title as assignmentTitle,
      ta.note as assignmentNote,
      o.name as organizationName
    FROM AssignmentRecipient ar
    JOIN TrainingAssignment ta ON ta.id = ar.assignmentId
    LEFT JOIN Organization o ON o.id = ar.organizationId
    WHERE ar.id=?
    LIMIT 1
    `,
    [assignmentRecipientId]
  );

  return (res.rows?.[0] as AssignmentRecipientDetails | undefined) ?? null;
}

export async function getAssignmentRecipientsForAssignment(
  assignmentId: string
): Promise<AssignmentRecipientProgressDetails[]> {
  const res = await execute(
    `
    SELECT
      ar.*,
      om.role as memberRole,
      om.status as memberStatus,
      up.email as email,
      COALESCE(alp.completion, 0) as completion
    FROM AssignmentRecipient ar
    LEFT JOIN OrganizationMember om
      ON om.organizationId = ar.organizationId
      AND om.userId = ar.userId
    LEFT JOIN UserProfile up
      ON up.userId = ar.userId
    LEFT JOIN AssignmentLessonProgress alp
      ON alp.assignmentRecipientId = ar.id
    WHERE ar.assignmentId=?
    ORDER BY
      CASE ar.status
        WHEN 'overdue' THEN 0
        WHEN 'in_progress' THEN 1
        WHEN 'not_started' THEN 2
        WHEN 'completed' THEN 3
        ELSE 4
      END ASC,
      COALESCE(alp.completion, 0) DESC,
      ar.assignedAt DESC
    `,
    [assignmentId]
  );

  return res.rows as AssignmentRecipientProgressDetails[];
}

export async function createTrainingAssignment(input: {
  organizationId: string;
  lessonId: string;
  title?: string | null;
  note?: string | null;
  targetType: "user" | "team";
  targetId: string;
  assignedBy: string;
  dueAt?: number | null;
}): Promise<{ assignment: TrainingAssignment; recipients: AssignmentRecipient[] }> {
  const now = Date.now();
  const assignmentId = uuid();

  const recipientUserIds =
    input.targetType === "team"
      ? Array.from(new Set((await getTeamMembers(input.targetId)).map((member) => member.userId)))
      : [input.targetId];

  if (!recipientUserIds.length) {
    throw new Error(
      input.targetType === "team"
        ? "Selected team has no members."
        : "Selected member is invalid."
    );
  }

  const assignment: TrainingAssignment = {
    id: assignmentId,
    organizationId: input.organizationId,
    lessonId: input.lessonId,
    title: input.title?.trim() ? input.title.trim() : null,
    note: input.note?.trim() ? input.note.trim() : null,
    targetType: input.targetType,
    targetId: input.targetId,
    assignedBy: input.assignedBy,
    dueAt: input.dueAt ?? null,
    status: "active",
    createdAt: now,
    updatedAt: now,
    pendingSync: 0,
  };

  const recipients: AssignmentRecipient[] = recipientUserIds.map((userId) => ({
    id: uuid(),
    assignmentId,
    organizationId: input.organizationId,
    lessonId: input.lessonId,
    userId,
    status: "not_started",
    assignedAt: now,
    dueAt: input.dueAt ?? null,
    startedAt: null,
    completedAt: null,
    lastProgressAt: null,
    pendingSync: 0,
  }));

  return withAuditEvent(
    {
      actorUserId: input.assignedBy,
      organizationId: input.organizationId,
      category: "audit",
      action: "assignment_created",
      targetType: "training_assignment",
      targetId: assignmentId,
      metadata: {
        lessonId: input.lessonId,
        targetType: input.targetType,
        recipientCount: recipients.length,
      },
    },
    async () => {
      const { error: assignmentError } = await supabase.from("training_assignments").insert({
        id: assignment.id,
        organization_id: assignment.organizationId,
        lesson_id: assignment.lessonId,
        title: assignment.title,
        note: assignment.note,
        target_type: assignment.targetType,
        target_id: assignment.targetId,
        assigned_by: assignment.assignedBy,
        due_at: assignment.dueAt ? new Date(assignment.dueAt).toISOString() : null,
        status: assignment.status,
      });

      if (assignmentError) {
        throw assignmentError;
      }

      const { error: recipientError } = await supabase.from("assignment_recipients").insert(
        recipients.map((recipient) => ({
          id: recipient.id,
          assignment_id: recipient.assignmentId,
          organization_id: recipient.organizationId,
          lesson_id: recipient.lessonId,
          user_id: recipient.userId,
          status: recipient.status,
          assigned_at: new Date(recipient.assignedAt).toISOString(),
          due_at: recipient.dueAt ? new Date(recipient.dueAt).toISOString() : null,
          started_at: null,
          completed_at: null,
          last_progress_at: null,
        }))
      );

      if (recipientError) {
        await supabase.from("training_assignments").delete().eq("id", assignment.id);
        throw recipientError;
      }

      await cacheTrainingAssignments([assignment]);
      await cacheAssignmentRecipients(recipients);

      return { assignment, recipients };
    }
  );
}

export async function deleteTrainingAssignment(input: {
  assignmentId: string;
}): Promise<void> {
  await withAuditEvent(
    {
      category: "audit",
      action: "assignment_deleted",
      targetType: "training_assignment",
      targetId: input.assignmentId,
    },
    async () => {
      const { error } = await supabase
        .from("training_assignments")
        .delete()
        .eq("id", input.assignmentId);

      if (error) {
        throw error;
      }

      await execute(`DELETE FROM AssignmentRecipient WHERE assignmentId=?`, [input.assignmentId]);
      await execute(`DELETE FROM TrainingAssignment WHERE id=?`, [input.assignmentId]);
    }
  );
}

export async function updateAssignmentRecipientLocalProgress(input: {
  assignmentRecipientId: string;
  status: AssignmentRecipientStatus;
  progressAt: number;
}): Promise<void> {
  const startedAt = input.status === "in_progress" ? input.progressAt : null;
  const completedAt = input.status === "completed" ? input.progressAt : null;

  await execute(
    `
    UPDATE AssignmentRecipient
    SET
      status=?,
      startedAt=COALESCE(startedAt, ?),
      completedAt=CASE WHEN ? IS NOT NULL THEN ? ELSE completedAt END,
      lastProgressAt=?,
      pendingSync=1
    WHERE id=?
    `,
    [
      input.status,
      startedAt,
      completedAt,
      completedAt,
      input.progressAt,
      input.assignmentRecipientId,
    ]
  );
}

export async function setSyncCursor(entity: string, cursor: string | null) {
  const now = Date.now();
  await execute(
    `
    INSERT INTO SyncCursor (entity, cursor, lastSyncedAt)
    VALUES (?, ?, ?)
    ON CONFLICT(entity) DO UPDATE SET cursor=excluded.cursor, lastSyncedAt=excluded.lastSyncedAt
    `,
    [entity, cursor, now]
  );
}

export async function getSyncCursor(entity: string): Promise<SyncCursor | null> {
  const res = await execute(
    `SELECT * FROM SyncCursor WHERE entity=? LIMIT 1`,
    [entity]
  );
  return (res.rows?.[0] as SyncCursor) ?? null;
}

export async function enqueueSyncOutboxItem(item: SyncOutboxItem): Promise<void> {
  await execute(
    `
    INSERT OR REPLACE INTO SyncOutbox (
      id, entity, recordId, operation, payload, attempts, lastError, createdAt, updatedAt
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      item.id,
      item.entity,
      item.recordId,
      item.operation,
      item.payload,
      item.attempts,
      item.lastError ?? null,
      item.createdAt,
      item.updatedAt,
    ]
  );
}

export async function listSyncOutboxItems(): Promise<SyncOutboxItem[]> {
  const res = await execute(
    `SELECT * FROM SyncOutbox ORDER BY createdAt ASC`
  );
  return res.rows as SyncOutboxItem[];
}

async function replaceCacheRows(
  table: string,
  columns: string[],
  rows: Array<Record<string, unknown>>
) {
  for (const row of rows) {
    const placeholders = columns.map(() => "?").join(", ");
    const values = columns.map((column) => row[column] ?? null);
    await execute(
      `
      INSERT OR REPLACE INTO ${table} (${columns.join(", ")})
      VALUES (${placeholders})
      `,
      values
    );
  }
}

function createPlaceholders(count: number) {
  return Array.from({ length: count }, () => "?").join(", ");
}

async function pruneOrganizationScopedRows(
  table: "Team" | "TeamMember" | "OrganizationInvite" | "TrainingAssignment" | "AssignmentRecipient",
  organizationIds: string[],
  keepIds: string[]
) {
  if (!organizationIds.length) {
    return;
  }

  const organizationPlaceholders = createPlaceholders(organizationIds.length);

  if (!keepIds.length) {
    await execute(
      `DELETE FROM ${table} WHERE organizationId IN (${organizationPlaceholders})`,
      organizationIds
    );
    return;
  }

  await execute(
    `DELETE FROM ${table} WHERE organizationId IN (${organizationPlaceholders}) AND id NOT IN (${createPlaceholders(keepIds.length)})`,
    [...organizationIds, ...keepIds]
  );
}

export async function pruneOrganizationScopeCache(input: {
  organizationIds: string[];
  teamIds: string[];
  teamMemberIds: string[];
  inviteIds: string[];
  assignmentIds: string[];
  assignmentRecipientIds: string[];
}): Promise<void> {
  if (!input.organizationIds.length) {
    return;
  }

  await pruneOrganizationScopedRows("TeamMember", input.organizationIds, input.teamMemberIds);
  await pruneOrganizationScopedRows("Team", input.organizationIds, input.teamIds);
  await pruneOrganizationScopedRows("OrganizationInvite", input.organizationIds, input.inviteIds);
  await pruneOrganizationScopedRows("AssignmentRecipient", input.organizationIds, input.assignmentRecipientIds);
  await pruneOrganizationScopedRows("TrainingAssignment", input.organizationIds, input.assignmentIds);
}

export async function cacheOrganizations(rows: Organization[]): Promise<void> {
  await replaceCacheRows(
    "Organization",
    ["id", "name", "slug", "createdBy", "createdAt", "updatedAt", "archivedAt", "pendingSync"],
    rows as Array<Record<string, unknown>>
  );
}

export async function cacheOrganizationMembers(rows: OrganizationMember[]): Promise<void> {
  await replaceCacheRows(
    "OrganizationMember",
    [
      "id",
      "organizationId",
      "userId",
      "role",
      "status",
      "joinedAt",
      "createdAt",
      "updatedAt",
      "pendingSync",
    ],
    rows as Array<Record<string, unknown>>
  );
}

export async function cacheTeams(rows: Team[]): Promise<void> {
  await replaceCacheRows(
    "Team",
    [
      "id",
      "organizationId",
      "name",
      "description",
      "createdBy",
      "createdAt",
      "updatedAt",
      "archivedAt",
      "pendingSync",
    ],
    rows as Array<Record<string, unknown>>
  );
}

export async function cacheTeamMembers(rows: TeamMember[]): Promise<void> {
  await replaceCacheRows(
    "TeamMember",
    ["id", "teamId", "organizationId", "userId", "createdAt", "pendingSync"],
    rows as Array<Record<string, unknown>>
  );
}

export async function cacheOrganizationInvites(
  rows: OrganizationInvite[]
): Promise<void> {
  await replaceCacheRows(
    "OrganizationInvite",
    [
      "id",
      "organizationId",
      "email",
      "role",
      "invitedBy",
      "token",
      "status",
      "expiresAt",
      "acceptedAt",
      "createdAt",
      "updatedAt",
      "pendingSync",
    ],
    rows as Array<Record<string, unknown>>
  );
}

export async function cacheTrainingAssignments(
  rows: TrainingAssignment[]
): Promise<void> {
  await replaceCacheRows(
    "TrainingAssignment",
    [
      "id",
      "organizationId",
      "lessonId",
      "title",
      "note",
      "targetType",
      "targetId",
      "assignedBy",
      "dueAt",
      "status",
      "createdAt",
      "updatedAt",
      "pendingSync",
    ],
    rows as Array<Record<string, unknown>>
  );
}

export async function cacheAssignmentRecipients(
  rows: AssignmentRecipient[]
): Promise<void> {
  await replaceCacheRows(
    "AssignmentRecipient",
    [
      "id",
      "assignmentId",
      "organizationId",
      "lessonId",
      "userId",
      "status",
      "assignedAt",
      "dueAt",
      "startedAt",
      "completedAt",
      "lastProgressAt",
      "pendingSync",
    ],
    rows as Array<Record<string, unknown>>
  );
}