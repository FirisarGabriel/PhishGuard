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
  completion: number;
  lastViewedAt?: number;
  pendingSync: 0 | 1;
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
