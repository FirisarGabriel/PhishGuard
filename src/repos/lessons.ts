import { execute } from "../db";
import { v4 as uuid } from "uuid";
import type { Lesson, LessonProgress } from "../types/models";

export async function getLessons(): Promise<Lesson[]> {
  const res = await execute(`SELECT * FROM Lesson ORDER BY "order" ASC`);
  return res.rows as Lesson[];
}

export async function getLessonById(id: string): Promise<Lesson | null> {
  const res = await execute(`SELECT * FROM Lesson WHERE id=?`, [id]);
  return (res.rows?.[0] as Lesson) ?? null;
}

export async function getProgressMap(
  userId: string
): Promise<Record<string, LessonProgress>> {
  const res = await execute(`SELECT * FROM LessonProgress WHERE userId=?`, [
    userId,
  ]);
  const map: Record<string, LessonProgress> = {};
  res.rows.forEach((r: any) => (map[r.lessonId] = r));
  return map;
}

/**
 * Returns next order value for a new lesson: MAX(order)+1 (or 1 if empty)
 */
export async function getNextLessonOrder(): Promise<number> {
  const res = await execute(`SELECT MAX("order") as m FROM Lesson`);
  const maxOrder = Number(res.rows?.[0]?.m ?? 0);
  return (Number.isFinite(maxOrder) ? maxOrder : 0) + 1;
}

/**
 * Create a new lesson (training)
 */
export async function createLesson(input: {
  title: string;
  summary: string;
  content: string;
  order?: number;
}): Promise<Lesson> {
  const id = uuid();
  const order =
    typeof input.order === "number" ? input.order : await getNextLessonOrder();

  const lesson: Lesson = {
    id,
    title: input.title.trim(),
    summary: input.summary.trim(),
    content: input.content.trim(),
    order,
  };

  await execute(
    `INSERT INTO Lesson (id, title, summary, content, "order")
     VALUES (?, ?, ?, ?, ?)`,
    [lesson.id, lesson.title, lesson.summary, lesson.content, lesson.order]
  );

  return lesson;
}

/**
 * Update an existing lesson
 */
export async function updateLesson(
  id: string,
  patch: Partial<Pick<Lesson, "title" | "summary" | "content" | "order">>
): Promise<void> {
  const current = await getLessonById(id);
  if (!current) throw new Error("Lesson not found.");

  const next: Lesson = {
    ...current,
    title: patch.title !== undefined ? patch.title.trim() : current.title,
    summary:
      patch.summary !== undefined ? patch.summary.trim() : current.summary,
    content:
      patch.content !== undefined ? patch.content.trim() : current.content,
    order: typeof patch.order === "number" ? patch.order : current.order,
  };

  await execute(
    `UPDATE Lesson
     SET title=?, summary=?, content=?, "order"=?
     WHERE id=?`,
    [next.title, next.summary, next.content, next.order, id]
  );
}

/**
 * Delete a lesson + related progress rows
 */
export async function deleteLesson(id: string): Promise<void> {
  // cleanup progress first (safe even if no rows)
  await execute(`DELETE FROM LessonProgress WHERE lessonId=?`, [id]);

  // delete lesson
  await execute(`DELETE FROM Lesson WHERE id=?`, [id]);
}

export async function markProgress(
  userId: string,
  lessonId: string,
  completion: number
) {
  const now = Date.now();
  const existing = await execute(
    `SELECT id FROM LessonProgress WHERE userId=? AND lessonId=?`,
    [userId, lessonId]
  );

  if (existing.rows.length) {
    await execute(
      `UPDATE LessonProgress
       SET completion=?, lastViewedAt=?, pendingSync=1
       WHERE userId=? AND lessonId=?`,
      [completion, now, userId, lessonId]
    );
  } else {
    await execute(
      `INSERT INTO LessonProgress (id, userId, lessonId, completion, lastViewedAt, pendingSync)
       VALUES (?, ?, ?, ?, ?, 1)`,
      [uuid(), userId, lessonId, completion, now]
    );
  }
}

export async function resetAllProgress(userId: string) {
  await execute(`DELETE FROM LessonProgress WHERE userId=?`, [userId]);
}
