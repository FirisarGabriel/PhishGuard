export type AchievementDefinition = {
  id: string;
  title: string;
  description: string;
};

export const ACHIEVEMENTS: AchievementDefinition[] = [
  {
    id: "first_training_done",
    title: "First Training Completed",
    description: "Complete your first training lesson.",
  },
  {
    id: "three_trainings_done",
    title: "Training Momentum x3",
    description: "Complete 3 training lessons.",
  },
  {
    id: "five_trainings_done",
    title: "Training Momentum x5",
    description: "Complete 5 training lessons.",
  },
  {
    id: "all_trainings_done",
    title: "Training Master",
    description: "Complete all available training lessons.",
  },
  {
    id: "first_quiz_done",
    title: "First Quiz Completed",
    description: "Finish your first quiz attempt.",
  },
  {
    id: "first_classic_quiz_done",
    title: "Classic Starter",
    description: "Finish your first Classic Quiz.",
  },
  {
    id: "first_visual_quiz_done",
    title: "Visual Starter",
    description: "Finish your first Visual Quiz.",
  },
  {
    id: "three_quizzes_done",
    title: "Quiz Streak x3",
    description: "Finish 3 quiz attempts.",
  },
  {
    id: "five_quizzes_done",
    title: "Quiz Streak x5",
    description: "Finish 5 quiz attempts.",
  },
  {
    id: "ten_quizzes_done",
    title: "Quiz Streak x10",
    description: "Finish 10 quiz attempts.",
  },
  {
    id: "fifteen_quizzes_done",
    title: "Quiz Streak x15",
    description: "Finish 15 quiz attempts.",
  },
  {
    id: "five_classic_quizzes_done",
    title: "Classic Grinder",
    description: "Finish 5 Classic Quiz attempts.",
  },
  {
    id: "five_visual_quizzes_done",
    title: "Visual Grinder",
    description: "Finish 5 Visual Quiz attempts.",
  },
];

export const ACHIEVEMENT_IDS = new Set(ACHIEVEMENTS.map((a) => a.id));

export const ACHIEVEMENT_BY_ID: Record<string, AchievementDefinition> =
  ACHIEVEMENTS.reduce((acc, item) => {
    acc[item.id] = item;
    return acc;
  }, {} as Record<string, AchievementDefinition>);
