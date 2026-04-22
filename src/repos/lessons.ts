import { execute } from "../db";
import { v4 as uuid } from "uuid";
import type {
  Lesson,
  LessonProgress,
  TrainingBlock,
  TrainingBlockOption,
  TrainingBlockProgress,
  TrainingBlockWithOptions,
} from "../types/models";

export async function getLessons(): Promise<Lesson[]> {
  const res = await execute(`SELECT * FROM Lesson ORDER BY "order" ASC`);
  return res.rows as Lesson[];
}

export async function getLessonById(id: string): Promise<Lesson | null> {
  const res = await execute(`SELECT * FROM Lesson WHERE id=?`, [id]);
  return (res.rows?.[0] as Lesson) ?? null;
}

export async function getLessonBlocks(
  lessonId: string
): Promise<TrainingBlockWithOptions[]> {
  const blocksRes = await execute(
    `
    SELECT *
    FROM TrainingBlock
    WHERE lessonId=?
    ORDER BY "order" ASC
    `,
    [lessonId]
  );

  const blocks = blocksRes.rows as TrainingBlock[];
  const out: TrainingBlockWithOptions[] = [];

  for (const block of blocks) {
    let options: TrainingBlockOption[] = [];
    if (block.type === "question_single") {
      const optionsRes = await execute(
        `
        SELECT *
        FROM TrainingBlockOption
        WHERE blockId=?
        ORDER BY "order" ASC
        `,
        [block.id]
      );
      options = optionsRes.rows as TrainingBlockOption[];
    }

    out.push({ ...block, options });
  }

  return out;
}

export async function getBlockProgressMap(
  userId: string,
  lessonId: string
): Promise<Record<string, TrainingBlockProgress>> {
  const res = await execute(
    `
    SELECT *
    FROM TrainingBlockProgress
    WHERE userId=? AND lessonId=?
    `,
    [userId, lessonId]
  );
  const map: Record<string, TrainingBlockProgress> = {};
  res.rows.forEach((r: any) => (map[r.blockId] = r));
  return map;
}

async function upsertLessonProgress(
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
      `
      UPDATE LessonProgress
      SET completion=?, lastViewedAt=?, pendingSync=1
      WHERE userId=? AND lessonId=?
      `,
      [completion, now, userId, lessonId]
    );
    return;
  }

  await execute(
    `
    INSERT INTO LessonProgress (id, userId, lessonId, completion, lastViewedAt, pendingSync)
    VALUES (?, ?, ?, ?, ?, 1)
    `,
    [uuid(), userId, lessonId, completion, now]
  );
}

async function recomputeLessonCompletion(userId: string, lessonId: string) {
  const requiredCountRes = await execute(
    `
    SELECT COUNT(*) as c
    FROM TrainingBlock
    WHERE lessonId=? AND isRequired=1
    `,
    [lessonId]
  );
  const requiredCount = Number(requiredCountRes.rows?.[0]?.c ?? 0);

  let completion = 0;
  if (requiredCount > 0) {
    const doneCountRes = await execute(
      `
      SELECT COUNT(*) as c
      FROM TrainingBlockProgress tbp
      JOIN TrainingBlock tb ON tb.id = tbp.blockId
      WHERE tbp.userId=?
        AND tbp.lessonId=?
        AND tbp.status='completed'
        AND tb.isRequired=1
      `,
      [userId, lessonId]
    );
    const doneCount = Number(doneCountRes.rows?.[0]?.c ?? 0);
    completion = Math.round((doneCount / requiredCount) * 100);
  }

  await upsertLessonProgress(userId, lessonId, completion);
}

export async function completeTextBlock(
  userId: string,
  lessonId: string,
  blockId: string
): Promise<void> {
  const now = Date.now();
  const existing = await execute(
    `SELECT id FROM TrainingBlockProgress WHERE userId=? AND blockId=?`,
    [userId, blockId]
  );

  if (existing.rows.length) {
    await execute(
      `
      UPDATE TrainingBlockProgress
      SET status='completed', completedAt=?, pendingSync=1
      WHERE userId=? AND blockId=?
      `,
      [now, userId, blockId]
    );
  } else {
    await execute(
      `
      INSERT INTO TrainingBlockProgress (
        id, userId, lessonId, blockId, status, completedAt, pendingSync
      )
      VALUES (?, ?, ?, ?, 'completed', ?, 1)
      `,
      [uuid(), userId, lessonId, blockId, now]
    );
  }

  await recomputeLessonCompletion(userId, lessonId);
}

export async function submitSingleChoiceAnswer(
  userId: string,
  lessonId: string,
  blockId: string,
  selectedOptionId: string
): Promise<{ isCorrect: boolean }> {
  const optionRes = await execute(
    `SELECT isCorrect FROM TrainingBlockOption WHERE id=? AND blockId=? LIMIT 1`,
    [selectedOptionId, blockId]
  );
  if (!optionRes.rows.length) {
    throw new Error("Option not found.");
  }

  const isCorrect = Number(optionRes.rows[0]?.isCorrect ?? 0) === 1;
  const status = isCorrect ? "completed" : "not_started";
  const now = Date.now();
  const existing = await execute(
    `SELECT id FROM TrainingBlockProgress WHERE userId=? AND blockId=?`,
    [userId, blockId]
  );

  if (existing.rows.length) {
    await execute(
      `
      UPDATE TrainingBlockProgress
      SET status=?, selectedOptionId=?, isCorrect=?, completedAt=?, pendingSync=1
      WHERE userId=? AND blockId=?
      `,
      [status, selectedOptionId, isCorrect ? 1 : 0, isCorrect ? now : null, userId, blockId]
    );
  } else {
    await execute(
      `
      INSERT INTO TrainingBlockProgress (
        id, userId, lessonId, blockId, status, selectedOptionId, isCorrect, completedAt, pendingSync
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
      `,
      [
        uuid(),
        userId,
        lessonId,
        blockId,
        status,
        selectedOptionId,
        isCorrect ? 1 : 0,
        isCorrect ? now : null,
      ]
    );
  }

  await recomputeLessonCompletion(userId, lessonId);
  return { isCorrect };
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
  await upsertLessonProgress(userId, lessonId, completion);
}

export async function resetAllProgress(userId: string) {
  await execute(`DELETE FROM TrainingBlockProgress WHERE userId=?`, [userId]);
  await execute(`DELETE FROM LessonProgress WHERE userId=?`, [userId]);
}
