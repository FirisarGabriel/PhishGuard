import { v4 as uuid } from "uuid";

import { execute } from "../db";
import { ACHIEVEMENTS } from "../achievements/catalog";

export type AchievementOverviewItem = {
  id: string;
  title: string;
  description: string;
  unlockedAt: number | null;
};

async function getCompletedTrainingCount(userId: string): Promise<number> {
  const r = await execute(
    `SELECT COUNT(*) as c FROM LessonProgress WHERE userId=? AND completion>=100`,
    [userId]
  );
  return Number(r.rows?.[0]?.c ?? 0);
}

async function getTotalTrainingCount(): Promise<number> {
  const r = await execute(`SELECT COUNT(*) as c FROM Lesson`);
  return Number(r.rows?.[0]?.c ?? 0);
}

async function getFinishedQuizCount(userId: string): Promise<number> {
  const r = await execute(
    `SELECT COUNT(*) as c FROM QuizAttempt WHERE userId=? AND finishedAt IS NOT NULL`,
    [userId]
  );
  return Number(r.rows?.[0]?.c ?? 0);
}

async function getFinishedQuizCountByKind(
  userId: string,
  kind: "classic" | "visual"
): Promise<number> {
  const r = await execute(
    `
      SELECT COUNT(*) as c
      FROM QuizAttempt qa
      JOIN Quiz q ON q.id = qa.quizId
      WHERE qa.userId=? AND qa.finishedAt IS NOT NULL AND q.kind=?
    `,
    [userId, kind]
  );
  return Number(r.rows?.[0]?.c ?? 0);
}

export async function getUnlockedAchievementRows(userId: string): Promise<
  Array<{ achievementId: string; unlockedAt: number }>
> {
  const r = await execute(
    `SELECT achievementId, unlockedAt FROM AchievementUnlock WHERE userId=? ORDER BY unlockedAt DESC`,
    [userId]
  );

  return (r.rows ?? []).map((row: any) => ({
    achievementId: String(row.achievementId),
    unlockedAt: Number(row.unlockedAt ?? 0),
  }));
}

export async function getUnlockedAchievementIds(userId: string): Promise<string[]> {
  const rows = await getUnlockedAchievementRows(userId);
  return rows.map((row) => row.achievementId);
}

export async function getLatestAchievementUnlockAt(userId: string): Promise<number> {
  const r = await execute(
    `SELECT MAX(unlockedAt) as latest FROM AchievementUnlock WHERE userId=?`,
    [userId]
  );
  return Number(r.rows?.[0]?.latest ?? 0);
}

export async function getUnreadAchievementCount(
  userId: string,
  seenAt: number
): Promise<number> {
  const r = await execute(
    `SELECT COUNT(*) as c FROM AchievementUnlock WHERE userId=? AND unlockedAt>?`,
    [userId, seenAt]
  );
  return Number(r.rows?.[0]?.c ?? 0);
}

export async function getAchievementOverview(userId: string): Promise<AchievementOverviewItem[]> {
  const unlockedRows = await getUnlockedAchievementRows(userId);
  const unlockedMap: Record<string, number> = {};

  unlockedRows.forEach((row) => {
    unlockedMap[row.achievementId] = row.unlockedAt;
  });

  return ACHIEVEMENTS.map((a) => ({
    id: a.id,
    title: a.title,
    description: a.description,
    unlockedAt: unlockedMap[a.id] ?? null,
  }));
}

export async function resetAllAchievements(userId: string): Promise<void> {
  await execute(`DELETE FROM AchievementUnlock WHERE userId=?`, [userId]);
}

async function unlockEligibleAchievements(
  userId: string,
  eligible: string[]
): Promise<string[]> {
  const unlockedIds = await getUnlockedAchievementIds(userId);
  const alreadyUnlocked = new Set(unlockedIds);
  const now = Date.now();
  const newlyUnlocked: string[] = [];

  for (const achievementId of eligible) {
    if (alreadyUnlocked.has(achievementId)) continue;

    await execute(
      `INSERT INTO AchievementUnlock (id, userId, achievementId, unlockedAt) VALUES (?, ?, ?, ?)`,
      [uuid(), userId, achievementId, now]
    );

    newlyUnlocked.push(achievementId);
  }

  return newlyUnlocked;
}

export async function evaluateTrainingAchievements(userId: string): Promise<string[]> {
  const [completedTrainingCount, totalTrainingCount] = await Promise.all([
    getCompletedTrainingCount(userId),
    getTotalTrainingCount(),
  ]);
  const eligible: string[] = [];

  if (completedTrainingCount >= 1) {
    eligible.push("first_training_done");
  }
  if (completedTrainingCount >= 3) {
    eligible.push("three_trainings_done");
  }
  if (completedTrainingCount >= 5) {
    eligible.push("five_trainings_done");
  }
  if (totalTrainingCount > 0 && completedTrainingCount >= totalTrainingCount) {
    eligible.push("all_trainings_done");
  }

  return unlockEligibleAchievements(userId, eligible);
}

export async function evaluateQuizAchievements(userId: string): Promise<string[]> {
  const [finishedQuizCount, classicFinishedCount, visualFinishedCount] = await Promise.all([
    getFinishedQuizCount(userId),
    getFinishedQuizCountByKind(userId, "classic"),
    getFinishedQuizCountByKind(userId, "visual"),
  ]);
  const eligible: string[] = [];

  if (finishedQuizCount >= 1) {
    eligible.push("first_quiz_done");
  }
  if (classicFinishedCount >= 1) {
    eligible.push("first_classic_quiz_done");
  }
  if (visualFinishedCount >= 1) {
    eligible.push("first_visual_quiz_done");
  }
  if (finishedQuizCount >= 3) {
    eligible.push("three_quizzes_done");
  }
  if (finishedQuizCount >= 5) {
    eligible.push("five_quizzes_done");
  }
  if (finishedQuizCount >= 10) {
    eligible.push("ten_quizzes_done");
  }
  if (finishedQuizCount >= 15) {
    eligible.push("fifteen_quizzes_done");
  }
  if (classicFinishedCount >= 5) {
    eligible.push("five_classic_quizzes_done");
  }
  if (visualFinishedCount >= 5) {
    eligible.push("five_visual_quizzes_done");
  }

  return unlockEligibleAchievements(userId, eligible);
}
