export type Lesson = {
  id: string;
  title: string;
  summary: string;
  content: string;
  order: number;
};

export type TrainingBlockType = "text" | "question_single";

export type TrainingBlock = {
  id: string;
  lessonId: string;
  type: TrainingBlockType;
  title?: string | null;
  body?: string | null;
  order: number;
  isRequired: 0 | 1;
  pendingSync: 0 | 1;
};

export type TrainingBlockOption = {
  id: string;
  blockId: string;
  label: string;
  isCorrect: 0 | 1;
  order: number;
};

export type TrainingBlockProgress = {
  id: string;
  userId: string;
  lessonId: string;
  blockId: string;
  source?: "b2c" | "assignment";
  assignmentRecipientId?: string | null;
  status: "not_started" | "completed";
  selectedOptionId?: string | null;
  isCorrect?: 0 | 1 | null;
  completedAt?: number | null;
  pendingSync: 0 | 1;
};

export type TrainingBlockWithOptions = TrainingBlock & {
  options: TrainingBlockOption[];
};

export type LessonProgress = {
  id: string;
  userId: string;
  lessonId: string;
  source?: "b2c" | "assignment";
  assignmentRecipientId?: string | null;
  completion: number;
  lastViewedAt?: number;
  pendingSync: 0 | 1;
};

export type TrainingProgressContext = {
  source: "b2c" | "assignment";
  assignmentRecipientId?: string | null;
};
export type Quiz = {
  id: string;
  slug: string;            // "classic" | "visual"
  title: string;
  description?: string;
  kind: "classic" | "visual";
};

export type Question = {
  id: string;
  quizId: string;
  text: string;
  explanation?: string;
  order: number;
};

export type Option = {
  id: string;
  questionId: string;
  text: string;
  isCorrect: 0 | 1;
  order: number;
};

export type VisualCard = {
  id: string;
  quizId: string;
  asset: string;           // ex: "visual/fake_login.png"
  label?: string;
  isPhish: 0 | 1;
  variant?: "beginner" | "intermediate" | "expert";
  order: number;
};

export type QuizAttempt = {
  id: string;
  userId: string;
  quizId: string;
  score: number;
  startedAt: number;
  finishedAt?: number;
  variant?: string;
  pendingSync: 0 | 1;
};

export type AchievementUnlock = {
  id: string;
  userId: string;
  achievementId: string;
  unlockedAt: number;
};

export type PlatformRole = "USER" | "ADMIN";

export type OrganizationRole = "org_owner" | "org_manager" | "employee";

export type Organization = {
  id: string;
  name: string;
  slug: string;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
  archivedAt?: number | null;
  pendingSync: 0 | 1;
};

export type OrganizationMember = {
  id: string;
  organizationId: string;
  userId: string;
  role: OrganizationRole;
  status: "active" | "invited" | "disabled";
  joinedAt?: number | null;
  createdAt: number;
  updatedAt: number;
  pendingSync: 0 | 1;
};

export type Team = {
  id: string;
  organizationId: string;
  name: string;
  description?: string | null;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
  archivedAt?: number | null;
  pendingSync: 0 | 1;
};

export type TeamMember = {
  id: string;
  teamId: string;
  organizationId: string;
  userId: string;
  createdAt: number;
  pendingSync: 0 | 1;
};

export type OrganizationInvite = {
  id: string;
  organizationId: string;
  email: string;
  role: OrganizationRole;
  invitedBy: string;
  token: string;
  status: "pending" | "accepted" | "revoked" | "expired";
  expiresAt?: number | null;
  acceptedAt?: number | null;
  createdAt: number;
  updatedAt: number;
  pendingSync: 0 | 1;
};

export type AssignmentTargetType = "user" | "team";

export type AssignmentStatus = "active" | "completed" | "cancelled";

export type AssignmentRecipientStatus =
  | "not_started"
  | "in_progress"
  | "completed"
  | "overdue"
  | "cancelled";

export type TrainingAssignment = {
  id: string;
  organizationId: string;
  lessonId: string;
  title?: string | null;
  note?: string | null;
  targetType: AssignmentTargetType;
  targetId: string;
  assignedBy: string;
  dueAt?: number | null;
  status: AssignmentStatus;
  createdAt: number;
  updatedAt: number;
  pendingSync: 0 | 1;
};

export type AssignmentRecipient = {
  id: string;
  assignmentId: string;
  organizationId: string;
  lessonId: string;
  userId: string;
  status: AssignmentRecipientStatus;
  assignedAt: number;
  dueAt?: number | null;
  startedAt?: number | null;
  completedAt?: number | null;
  lastProgressAt?: number | null;
  pendingSync: 0 | 1;
};

export type SyncCursor = {
  entity: string;
  cursor?: string | null;
  lastSyncedAt?: number | null;
};

export type SyncOutboxItem = {
  id: string;
  entity: string;
  recordId: string;
  operation: "upsert" | "delete";
  payload: string;
  attempts: number;
  lastError?: string | null;
  createdAt: number;
  updatedAt: number;
};
