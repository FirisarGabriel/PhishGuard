export type Lesson = {
  id: string;
  title: string;
  summary: string;
  content: string;
  order: number;
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
