import { supabase } from "../auth/supabase";
import { getErrorMessage, recordAuditEventBestEffort } from "../observability/audit";
import {
  cacheAssignmentRecipients,
  cacheOrganizationInvites,
  cacheOrganizationMembers,
  cacheOrganizations,
  pruneOrganizationScopeCache,
  cacheTeams,
  cacheTeamMembers,
  cacheTrainingAssignments,
} from "../repos/b2b";
import {
  cacheRemoteAssignmentLessonProgress,
  cacheRemoteAssignmentTrainingBlockProgress,
  cacheRemoteLessonProgress,
  cacheRemoteTrainingBlockProgress,
  listPendingAssignmentLessonProgress,
  listPendingAssignmentTrainingBlockProgress,
  listPendingLessonProgress,
  listPendingTrainingBlockProgress,
  markAssignmentLessonProgressSynced,
  markAssignmentTrainingBlockProgressSynced,
  markLessonProgressSynced,
  markTrainingBlockProgressSynced,
} from "../repos/lessons";
import {
  cacheRemoteQuizAttempts,
  listPendingQuizAttempts,
  markQuizAttemptsSynced,
} from "../repos/quiz";
import { cacheUserProfiles, type UserProfile } from "../repos/profile";
import type {
  AssignmentRecipient,
  LessonProgress,
  Organization,
  OrganizationInvite,
  OrganizationMember,
  QuizAttempt,
  Team,
  TeamMember,
  TrainingAssignment,
  TrainingBlockProgress,
  AssignmentRecipientStatus,
} from "../types/models";

function isMissingAssignmentRecipientError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const record = error as Record<string, unknown>;
  const code = typeof record.code === "string" ? record.code : null;
  const message = typeof record.message === "string" ? record.message : "";
  const details = typeof record.details === "string" ? record.details : "";

  return (
    code === "23503" &&
    (message.includes("assignment_recipient") ||
      details.includes("assignment_recipient") ||
      message.includes("assignment_recipients") ||
      details.includes("assignment_recipients"))
  );
}

function toMillis(value: string | null | undefined): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function requireUserId(userId: string | null | undefined): string {
  if (!userId) {
    throw new Error("Cannot sync without an authenticated user.");
  }
  return userId;
}

function mapOrganization(row: any): Organization {
  return {
    id: String(row.id),
    name: String(row.name ?? ""),
    slug: String(row.slug ?? ""),
    createdBy: String(row.created_by ?? ""),
    createdAt: toMillis(row.created_at) ?? Date.now(),
    updatedAt: toMillis(row.updated_at) ?? Date.now(),
    archivedAt: toMillis(row.archived_at),
    pendingSync: 0,
  };
}

function mapOrganizationMember(row: any): OrganizationMember {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    userId: String(row.user_id),
    role: row.role,
    status: row.status,
    joinedAt: toMillis(row.joined_at),
    createdAt: toMillis(row.created_at) ?? Date.now(),
    updatedAt: toMillis(row.updated_at) ?? Date.now(),
    pendingSync: 0,
  };
}

function mapUserProfile(row: any): UserProfile {
  return {
    userId: String(row.id),
    email: row.email ? String(row.email) : null,
    role: row.platform_role === "ADMIN" ? "ADMIN" : "USER",
    createdAt: toMillis(row.created_at) ?? Date.now(),
    updatedAt: toMillis(row.updated_at) ?? Date.now(),
  };
}

function mapTeam(row: any): Team {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    name: String(row.name ?? ""),
    description: (row.description as string | null | undefined) ?? null,
    createdBy: String(row.created_by ?? ""),
    createdAt: toMillis(row.created_at) ?? Date.now(),
    updatedAt: toMillis(row.updated_at) ?? Date.now(),
    archivedAt: toMillis(row.archived_at),
    pendingSync: 0,
  };
}

function mapTeamMember(row: any): TeamMember {
  return {
    id: String(row.id),
    teamId: String(row.team_id),
    organizationId: String(row.organization_id),
    userId: String(row.user_id),
    createdAt: toMillis(row.created_at) ?? Date.now(),
    pendingSync: 0,
  };
}

function mapInvite(row: any): OrganizationInvite {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    email: String(row.email ?? ""),
    role: row.role,
    invitedBy: String(row.invited_by ?? ""),
    token: String(row.token ?? ""),
    status: row.status,
    expiresAt: toMillis(row.expires_at),
    acceptedAt: toMillis(row.accepted_at),
    createdAt: toMillis(row.created_at) ?? Date.now(),
    updatedAt: toMillis(row.updated_at) ?? Date.now(),
    pendingSync: 0,
  };
}

function mapAssignment(row: any): TrainingAssignment {
  return {
    id: String(row.id),
    organizationId: String(row.organization_id),
    lessonId: String(row.lesson_id),
    title: (row.title as string | null | undefined) ?? null,
    note: (row.note as string | null | undefined) ?? null,
    targetType: row.target_type,
    targetId: String(row.target_id),
    assignedBy: String(row.assigned_by ?? ""),
    dueAt: toMillis(row.due_at),
    status: row.status,
    createdAt: toMillis(row.created_at) ?? Date.now(),
    updatedAt: toMillis(row.updated_at) ?? Date.now(),
    pendingSync: 0,
  };
}

function mapAssignmentRecipient(row: any): AssignmentRecipient {
  return {
    id: String(row.id),
    assignmentId: String(row.assignment_id),
    organizationId: String(row.organization_id),
    lessonId: String(row.lesson_id),
    userId: String(row.user_id),
    status: row.status,
    assignedAt: toMillis(row.assigned_at) ?? Date.now(),
    dueAt: toMillis(row.due_at),
    startedAt: toMillis(row.started_at),
    completedAt: toMillis(row.completed_at),
    lastProgressAt: toMillis(row.last_progress_at),
    pendingSync: 0,
  };
}

function mapLessonProgress(row: any): LessonProgress {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    lessonId: String(row.lesson_id),
    completion: Number(row.completion ?? 0),
    lastViewedAt: toMillis(row.last_viewed_at) ?? undefined,
    pendingSync: 0,
  };
}

function mapBlockProgress(row: any): TrainingBlockProgress {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    lessonId: String(row.lesson_id),
    blockId: String(row.block_id),
    status: row.status,
    selectedOptionId: (row.selected_option_id as string | null | undefined) ?? null,
    isCorrect:
      typeof row.is_correct === "boolean"
        ? row.is_correct
          ? 1
          : 0
        : row.is_correct ?? null,
    completedAt: toMillis(row.completed_at) ?? null,
    pendingSync: 0,
  };
}

function mapQuizAttempt(row: any): QuizAttempt {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    quizId: String(row.quiz_id),
    score: Number(row.score ?? 0),
    startedAt: toMillis(row.started_at) ?? Date.now(),
    finishedAt: toMillis(row.finished_at) ?? undefined,
    variant: (row.variant as string | undefined) ?? undefined,
    pendingSync: 0,
  };
}

async function fetchB2BCache(userId: string) {
  const { data: membershipRows, error: membershipError } = await supabase
    .from("organization_members")
    .select(
      `
      id,
      organization_id,
      user_id,
      role,
      status,
      joined_at,
      created_at,
      updated_at
      `
    )
    .eq("user_id", userId);

  if (membershipError) {
    throw membershipError;
  }

  const memberships = (membershipRows ?? []).map(mapOrganizationMember);
  const organizationIds = Array.from(
    new Set(((membershipRows ?? []) as any[]).map((row) => row.organization_id).filter(Boolean))
  );

  let organizations: Organization[] = [];

  if (organizationIds.length) {
    const { data: organizationRows, error: organizationError } = await supabase
      .from("organizations")
      .select("id, name, slug, created_by, created_at, updated_at, archived_at")
      .in("id", organizationIds);

    if (organizationError) {
      throw organizationError;
    }

    organizations = (organizationRows ?? []).map(mapOrganization);
  }

  await cacheOrganizationMembers(memberships);
  await cacheOrganizations(organizations);

  const memberUserIds = Array.from(new Set(memberships.map((row) => row.userId).filter(Boolean)));
  if (memberUserIds.length) {
    const { data: profileRows, error: profileError } = await supabase
      .from("profiles")
      .select("id, email, platform_role, created_at, updated_at")
      .in("id", memberUserIds);

    if (profileError) {
      throw profileError;
    }

    await cacheUserProfiles((profileRows ?? []).map(mapUserProfile));
  }

  const cachedOrganizationIds = Array.from(new Set(organizations.map((row) => row.id)));
  if (!cachedOrganizationIds.length) {
    return { organizations: 0, assignments: 0 };
  }

  const [teamResult, teamMemberResult, inviteResult, assignmentResult, recipientResult] =
    await Promise.all([
      supabase
        .from("teams")
        .select("id, organization_id, name, description, created_by, created_at, updated_at, archived_at")
        .in("organization_id", cachedOrganizationIds),
      supabase
        .from("team_members")
        .select("id, team_id, organization_id, user_id, created_at")
        .in("organization_id", cachedOrganizationIds),
      supabase
        .from("organization_invites")
        .select("id, organization_id, email, role, invited_by, token, status, expires_at, accepted_at, created_at, updated_at")
        .in("organization_id", cachedOrganizationIds),
      supabase
        .from("training_assignments")
        .select("id, organization_id, lesson_id, title, note, target_type, target_id, assigned_by, due_at, status, created_at, updated_at")
        .in("organization_id", cachedOrganizationIds),
      supabase
        .from("assignment_recipients")
        .select("id, assignment_id, organization_id, lesson_id, user_id, status, assigned_at, due_at, started_at, completed_at, last_progress_at")
        .in("organization_id", cachedOrganizationIds),
    ]);

  if (teamResult.error) throw teamResult.error;
  if (teamMemberResult.error) throw teamMemberResult.error;
  if (inviteResult.error) throw inviteResult.error;
  if (assignmentResult.error) throw assignmentResult.error;
  if (recipientResult.error) throw recipientResult.error;

  await pruneOrganizationScopeCache({
    organizationIds: cachedOrganizationIds,
    teamIds: (teamResult.data ?? []).map((row) => String(row.id)),
    teamMemberIds: (teamMemberResult.data ?? []).map((row) => String(row.id)),
    inviteIds: (inviteResult.data ?? []).map((row) => String(row.id)),
    assignmentIds: (assignmentResult.data ?? []).map((row) => String(row.id)),
    assignmentRecipientIds: (recipientResult.data ?? []).map((row) => String(row.id)),
  });

  await Promise.all([
    cacheTeams((teamResult.data ?? []).map(mapTeam)),
    cacheTeamMembers((teamMemberResult.data ?? []).map(mapTeamMember)),
    cacheOrganizationInvites((inviteResult.data ?? []).map(mapInvite)),
    cacheTrainingAssignments((assignmentResult.data ?? []).map(mapAssignment)),
    cacheAssignmentRecipients((recipientResult.data ?? []).map(mapAssignmentRecipient)),
  ]);

  return {
    organizations: organizations.length,
    assignments: (assignmentResult.data ?? []).length,
  };
}

async function pushPendingProgress(userId: string) {
  const [lessonProgress, blockProgress, assignmentLessonProgress, assignmentBlockProgress, quizAttempts] = await Promise.all([
    listPendingLessonProgress(userId),
    listPendingTrainingBlockProgress(userId),
    listPendingAssignmentLessonProgress(userId),
    listPendingAssignmentTrainingBlockProgress(userId),
    listPendingQuizAttempts(userId),
  ]);

  const syncedAssignmentLessonProgressIds: string[] = [];
  const orphanAssignmentLessonProgressIds: string[] = [];
  const syncedAssignmentBlockProgressIds: string[] = [];
  const orphanAssignmentBlockProgressIds: string[] = [];

  for (const row of lessonProgress) {
    const payload = {
      id: row.id,
      user_id: row.userId,
      lesson_id: row.lessonId,
      completion: row.completion,
      last_viewed_at: row.lastViewedAt ? new Date(row.lastViewedAt).toISOString() : null,
      source: "b2c",
      assignment_recipient_id: null,
      completed_at: row.completion >= 100 && row.lastViewedAt
        ? new Date(row.lastViewedAt).toISOString()
        : null,
    };

    const { error } = await supabase.from("user_lesson_progress").upsert(payload, {
      onConflict: "id",
    });

    if (error) {
      throw error;
    }
  }

  for (const row of assignmentLessonProgress) {
    if (!row.assignmentRecipientId) {
      orphanAssignmentLessonProgressIds.push(row.id);
      continue;
    }

    const payload = {
      id: row.id,
      user_id: row.userId,
      lesson_id: row.lessonId,
      completion: row.completion,
      last_viewed_at: row.lastViewedAt ? new Date(row.lastViewedAt).toISOString() : null,
      source: "assignment",
      assignment_recipient_id: row.assignmentRecipientId,
      completed_at: row.completion >= 100 && row.lastViewedAt
        ? new Date(row.lastViewedAt).toISOString()
        : null,
    };

    const { error } = await supabase.from("user_lesson_progress").upsert(payload, {
      onConflict: "id",
    });

    if (error) {
      if (isMissingAssignmentRecipientError(error)) {
        orphanAssignmentLessonProgressIds.push(row.id);
        continue;
      }

      throw error;
    }

    syncedAssignmentLessonProgressIds.push(row.id);
  }

  for (const row of blockProgress) {
    const payload = {
      id: row.id,
      user_id: row.userId,
      lesson_id: row.lessonId,
      block_id: row.blockId,
      status: row.status,
      selected_option_id: row.selectedOptionId ?? null,
      is_correct: row.isCorrect === null || row.isCorrect === undefined ? null : row.isCorrect === 1,
      completed_at: row.completedAt ? new Date(row.completedAt).toISOString() : null,
      source: "b2c",
      assignment_recipient_id: null,
    };

    const { error } = await supabase.from("user_block_progress").upsert(payload, {
      onConflict: "id",
    });

    if (error) {
      throw error;
    }
  }

  for (const row of assignmentBlockProgress) {
    if (!row.assignmentRecipientId) {
      orphanAssignmentBlockProgressIds.push(row.id);
      continue;
    }

    const payload = {
      id: row.id,
      user_id: row.userId,
      lesson_id: row.lessonId,
      block_id: row.blockId,
      status: row.status,
      selected_option_id: row.selectedOptionId ?? null,
      is_correct: row.isCorrect === null || row.isCorrect === undefined ? null : row.isCorrect === 1,
      completed_at: row.completedAt ? new Date(row.completedAt).toISOString() : null,
      source: "assignment",
      assignment_recipient_id: row.assignmentRecipientId,
    };

    const { error } = await supabase.from("user_block_progress").upsert(payload, {
      onConflict: "id",
    });

    if (error) {
      if (isMissingAssignmentRecipientError(error)) {
        orphanAssignmentBlockProgressIds.push(row.id);
        continue;
      }

      throw error;
    }

    syncedAssignmentBlockProgressIds.push(row.id);
  }

  for (const row of quizAttempts) {
    const payload = {
      id: row.id,
      user_id: row.userId,
      quiz_id: row.quizId,
      score: row.score,
      variant: row.variant ?? null,
      started_at: new Date(row.startedAt).toISOString(),
      finished_at: row.finishedAt ? new Date(row.finishedAt).toISOString() : null,
      source: "b2c",
      assignment_recipient_id: null,
    };

    const { error } = await supabase.from("user_quiz_attempts").upsert(payload, {
      onConflict: "id",
    });

    if (error) {
      throw error;
    }
  }

  await Promise.all([
    markLessonProgressSynced(lessonProgress.map((row) => row.id)),
    markTrainingBlockProgressSynced(blockProgress.map((row) => row.id)),
    markAssignmentLessonProgressSynced([
      ...syncedAssignmentLessonProgressIds,
      ...orphanAssignmentLessonProgressIds,
    ]),
    markAssignmentTrainingBlockProgressSynced([
      ...syncedAssignmentBlockProgressIds,
      ...orphanAssignmentBlockProgressIds,
    ]),
    markQuizAttemptsSynced(quizAttempts.map((row) => row.id)),
  ]);

  return {
    lessonProgress: lessonProgress.length + syncedAssignmentLessonProgressIds.length,
    blockProgress: blockProgress.length + syncedAssignmentBlockProgressIds.length,
    quizAttempts: quizAttempts.length,
    skippedAssignmentLessonProgress: orphanAssignmentLessonProgressIds.length,
    skippedAssignmentBlockProgress: orphanAssignmentBlockProgressIds.length,
  };
}

async function pullRemoteProgress(userId: string) {
  const [lessonResult, assignmentLessonResult, blockResult, assignmentBlockResult, attemptResult] = await Promise.all([
    supabase
      .from("user_lesson_progress")
      .select("id, user_id, lesson_id, completion, last_viewed_at")
      .eq("user_id", userId)
      .eq("source", "b2c"),
    supabase
      .from("user_lesson_progress")
      .select("id, user_id, lesson_id, completion, last_viewed_at, assignment_recipient_id")
      .eq("user_id", userId)
      .eq("source", "assignment"),
    supabase
      .from("user_block_progress")
      .select("id, user_id, lesson_id, block_id, status, selected_option_id, is_correct, completed_at")
      .eq("user_id", userId)
      .eq("source", "b2c"),
    supabase
      .from("user_block_progress")
      .select("id, user_id, lesson_id, block_id, status, selected_option_id, is_correct, completed_at, assignment_recipient_id")
      .eq("user_id", userId)
      .eq("source", "assignment"),
    supabase
      .from("user_quiz_attempts")
      .select("id, user_id, quiz_id, score, variant, started_at, finished_at")
      .eq("user_id", userId)
      .eq("source", "b2c"),
  ]);

  if (lessonResult.error) throw lessonResult.error;
  if (assignmentLessonResult.error) throw assignmentLessonResult.error;
  if (blockResult.error) throw blockResult.error;
  if (assignmentBlockResult.error) throw assignmentBlockResult.error;
  if (attemptResult.error) throw attemptResult.error;

  await Promise.all([
    cacheRemoteLessonProgress((lessonResult.data ?? []).map(mapLessonProgress)),
    cacheRemoteAssignmentLessonProgress(
      (assignmentLessonResult.data ?? []).map((row) => ({
        ...mapLessonProgress(row),
        source: "assignment" as const,
        assignmentRecipientId: String(row.assignment_recipient_id ?? ""),
      }))
    ),
    cacheRemoteTrainingBlockProgress((blockResult.data ?? []).map(mapBlockProgress)),
    cacheRemoteAssignmentTrainingBlockProgress(
      (assignmentBlockResult.data ?? []).map((row) => ({
        ...mapBlockProgress(row),
        source: "assignment" as const,
        assignmentRecipientId: String(row.assignment_recipient_id ?? ""),
      }))
    ),
    cacheRemoteQuizAttempts((attemptResult.data ?? []).map(mapQuizAttempt)),
  ]);

  return {
    lessonProgress: (lessonResult.data ?? []).length + (assignmentLessonResult.data ?? []).length,
    blockProgress: (blockResult.data ?? []).length + (assignmentBlockResult.data ?? []).length,
    quizAttempts: (attemptResult.data ?? []).length,
  };
}

export type HybridSyncResult = {
  b2b: { organizations: number; assignments: number };
  pushed: {
    lessonProgress: number;
    blockProgress: number;
    quizAttempts: number;
    skippedAssignmentLessonProgress: number;
    skippedAssignmentBlockProgress: number;
  };
  pulled: { lessonProgress: number; blockProgress: number; quizAttempts: number };
};

export async function runHybridSync(
  userId: string,
  options?: { trigger?: string }
): Promise<HybridSyncResult> {
  const safeUserId = requireUserId(userId);
  const startedAt = Date.now();
  const trigger = options?.trigger ?? "manual";

  try {
    const b2b = await fetchB2BCache(safeUserId);
    const pushed = await pushPendingProgress(safeUserId);
    const pulled = await pullRemoteProgress(safeUserId);
    const result = { b2b, pushed, pulled };
    const totalOperations =
      b2b.organizations +
      b2b.assignments +
      pushed.lessonProgress +
      pushed.blockProgress +
      pushed.quizAttempts +
      pulled.lessonProgress +
      pulled.blockProgress +
      pulled.quizAttempts;
    const skippedOperations =
      pushed.skippedAssignmentLessonProgress +
      pushed.skippedAssignmentBlockProgress;
    const durationMs = Date.now() - startedAt;

    if (totalOperations > 0 || skippedOperations > 0 || durationMs >= 2500) {
      await recordAuditEventBestEffort({
        actorUserId: safeUserId,
        category: "sync",
        action: "hybrid_sync",
        status: "success",
        source: "mobile",
        durationMs,
        metadata: {
          trigger,
          totalOperations,
          organizations: b2b.organizations,
          assignments: b2b.assignments,
          pushedLessonProgress: pushed.lessonProgress,
          pushedBlockProgress: pushed.blockProgress,
          pushedQuizAttempts: pushed.quizAttempts,
          pulledLessonProgress: pulled.lessonProgress,
          pulledBlockProgress: pulled.blockProgress,
          pulledQuizAttempts: pulled.quizAttempts,
          skippedAssignmentLessonProgress: pushed.skippedAssignmentLessonProgress,
          skippedAssignmentBlockProgress: pushed.skippedAssignmentBlockProgress,
          noop: totalOperations === 0,
        },
      });
    }

    return result;
  } catch (error) {
    await recordAuditEventBestEffort({
      actorUserId: safeUserId,
      category: "sync",
      action: "hybrid_sync",
      status: "error",
      source: "mobile",
      durationMs: Date.now() - startedAt,
      errorMessage: getErrorMessage(error),
      metadata: { trigger },
    });
    throw error;
  }
}

export async function syncAssignmentRecipientProgress(input: {
  assignmentRecipientId: string;
  status: AssignmentRecipientStatus;
  progressAt: number;
}): Promise<void> {
  const payload: Record<string, string | null> = {
    status: input.status,
    last_progress_at: new Date(input.progressAt).toISOString(),
  };

  if (input.status === "in_progress") {
    payload.started_at = new Date(input.progressAt).toISOString();
  }

  if (input.status === "completed") {
    payload.completed_at = new Date(input.progressAt).toISOString();
  }

  const { error } = await supabase
    .from("assignment_recipients")
    .update(payload)
    .eq("id", input.assignmentRecipientId);

  if (error) {
    throw error;
  }
}
