import { execute } from "../db";
import { v4 as uuid } from "uuid";
import type {
  Lesson,
  LessonProgress,
  TrainingProgressContext,
  TrainingBlock,
  TrainingBlockOption,
  TrainingBlockProgress,
  TrainingBlockWithOptions,
} from "../types/models";

function isAssignmentContext(context?: TrainingProgressContext) {
  return context?.source === "assignment" && !!context.assignmentRecipientId;
}

function getLessonProgressTable(context?: TrainingProgressContext) {
  return isAssignmentContext(context) ? "AssignmentLessonProgress" : "LessonProgress";
}

function getBlockProgressTable(context?: TrainingProgressContext) {
  return isAssignmentContext(context)
    ? "AssignmentTrainingBlockProgress"
    : "TrainingBlockProgress";
}

export type LessonBlockInput = {
  type: TrainingBlock["type"];
  title?: string | null;
  body?: string | null;
  isRequired?: boolean | 0 | 1;
  options?: Array<{
    label: string;
    isCorrect: boolean | 0 | 1;
  }>;
};

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

function blockInputToLegacyContent(blocks: LessonBlockInput[]) {
  return blocks
    .map((block) => {
      const title = block.title?.trim();
      const body = block.type === "image" ? "" : block.body?.trim();
      return [title, body].filter(Boolean).join("\n");
    })
    .filter(Boolean)
    .join("\n\n");
}

export async function replaceLessonBlocks(
  lessonId: string,
  blocks: LessonBlockInput[]
): Promise<void> {
  await execute(
    `DELETE FROM TrainingBlockOption WHERE blockId IN (
      SELECT id FROM TrainingBlock WHERE lessonId=?
    )`,
    [lessonId]
  );
  await execute(`DELETE FROM TrainingBlockProgress WHERE lessonId=?`, [lessonId]);
  await execute(`DELETE FROM AssignmentTrainingBlockProgress WHERE lessonId=?`, [
    lessonId,
  ]);
  await execute(`DELETE FROM TrainingBlock WHERE lessonId=?`, [lessonId]);
  await execute(`DELETE FROM LessonProgress WHERE lessonId=?`, [lessonId]);
  await execute(`DELETE FROM AssignmentLessonProgress WHERE lessonId=?`, [lessonId]);

  let blockOrder = 1;
  for (const block of blocks) {
    const blockId = uuid();
    await execute(
      `
      INSERT INTO TrainingBlock (id, lessonId, type, title, body, "order", isRequired, pendingSync)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1)
      `,
      [
        blockId,
        lessonId,
        block.type,
        block.title?.trim() || null,
        block.body?.trim() || null,
        blockOrder++,
        block.isRequired === false || block.isRequired === 0 ? 0 : 1,
      ]
    );

    if (block.type === "question_single") {
      let optionOrder = 1;
      for (const option of block.options ?? []) {
        await execute(
          `
          INSERT INTO TrainingBlockOption (id, blockId, label, isCorrect, "order")
          VALUES (?, ?, ?, ?, ?)
          `,
          [
            uuid(),
            blockId,
            option.label.trim(),
            option.isCorrect === true || option.isCorrect === 1 ? 1 : 0,
            optionOrder++,
          ]
        );
      }
    }
  }
}

export async function getBlockProgressMap(
  userId: string,
  lessonId: string,
  context?: TrainingProgressContext
): Promise<Record<string, TrainingBlockProgress>> {
  const table = getBlockProgressTable(context);
  const assignmentFilter = isAssignmentContext(context)
    ? ` AND assignmentRecipientId=?`
    : "";
  const params = isAssignmentContext(context)
    ? [userId, lessonId, context?.assignmentRecipientId]
    : [userId, lessonId];
  const res = await execute(
    `
    SELECT *
    FROM ${table}
    WHERE userId=? AND lessonId=?${assignmentFilter}
    `,
    params
  );
  const map: Record<string, TrainingBlockProgress> = {};
  res.rows.forEach((r: any) => {
    map[r.blockId] = {
      ...r,
      source: isAssignmentContext(context) ? "assignment" : "b2c",
      assignmentRecipientId: r.assignmentRecipientId ?? context?.assignmentRecipientId ?? null,
    };
  });
  return map;
}

async function upsertLessonProgress(
  userId: string,
  lessonId: string,
  completion: number,
  context?: TrainingProgressContext
) {
  const table = getLessonProgressTable(context);
  const now = Date.now();
  const assignmentFilter = isAssignmentContext(context)
    ? ` AND assignmentRecipientId=?`
    : "";
  const existingParams = isAssignmentContext(context)
    ? [userId, lessonId, context?.assignmentRecipientId]
    : [userId, lessonId];
  const existing = await execute(
    `SELECT id FROM ${table} WHERE userId=? AND lessonId=?${assignmentFilter}`,
    existingParams
  );

  if (existing.rows.length) {
    if (isAssignmentContext(context)) {
      await execute(
        `
        UPDATE ${table}
        SET completion=?, lastViewedAt=?, pendingSync=1
        WHERE userId=? AND lessonId=? AND assignmentRecipientId=?
        `,
        [completion, now, userId, lessonId, context?.assignmentRecipientId]
      );
    } else {
      await execute(
        `
        UPDATE ${table}
        SET completion=?, lastViewedAt=?, pendingSync=1
        WHERE userId=? AND lessonId=?
        `,
        [completion, now, userId, lessonId]
      );
    }
    return;
  }

  if (isAssignmentContext(context)) {
    await execute(
      `
      INSERT INTO ${table} (
        id, userId, lessonId, assignmentRecipientId, completion, lastViewedAt, pendingSync
      )
      VALUES (?, ?, ?, ?, ?, ?, 1)
      `,
      [uuid(), userId, lessonId, context?.assignmentRecipientId, completion, now]
    );
    return;
  }

  await execute(
    `
    INSERT INTO ${table} (id, userId, lessonId, completion, lastViewedAt, pendingSync)
    VALUES (?, ?, ?, ?, ?, 1)
    `,
    [uuid(), userId, lessonId, completion, now]
  );
}

async function recomputeLessonCompletion(
  userId: string,
  lessonId: string,
  context?: TrainingProgressContext
) {
  const progressTable = getBlockProgressTable(context);
  const assignmentFilter = isAssignmentContext(context)
    ? ` AND tbp.assignmentRecipientId=?`
    : "";
  const params = isAssignmentContext(context)
    ? [userId, lessonId, context?.assignmentRecipientId]
    : [userId, lessonId];
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
      FROM ${progressTable} tbp
      JOIN TrainingBlock tb ON tb.id = tbp.blockId
      WHERE tbp.userId=?
        AND tbp.lessonId=?
        ${assignmentFilter}
        AND tbp.status='completed'
        AND tb.isRequired=1
      `,
      params
    );
    const doneCount = Number(doneCountRes.rows?.[0]?.c ?? 0);
    completion = Math.round((doneCount / requiredCount) * 100);
  }

  await upsertLessonProgress(userId, lessonId, completion, context);
}

export async function completeTextBlock(
  userId: string,
  lessonId: string,
  blockId: string,
  context?: TrainingProgressContext
): Promise<void> {
  const table = getBlockProgressTable(context);
  const now = Date.now();
  const assignmentFilter = isAssignmentContext(context)
    ? ` AND assignmentRecipientId=?`
    : "";
  const existingParams = isAssignmentContext(context)
    ? [userId, blockId, context?.assignmentRecipientId]
    : [userId, blockId];
  const existing = await execute(
    `SELECT id FROM ${table} WHERE userId=? AND blockId=?${assignmentFilter}`,
    existingParams
  );

  if (existing.rows.length) {
    if (isAssignmentContext(context)) {
      await execute(
        `
        UPDATE ${table}
        SET status='completed', completedAt=?, pendingSync=1
        WHERE userId=? AND blockId=? AND assignmentRecipientId=?
        `,
        [now, userId, blockId, context?.assignmentRecipientId]
      );
    } else {
      await execute(
        `
        UPDATE ${table}
        SET status='completed', completedAt=?, pendingSync=1
        WHERE userId=? AND blockId=?
        `,
        [now, userId, blockId]
      );
    }
  } else {
    if (isAssignmentContext(context)) {
      await execute(
        `
        INSERT INTO ${table} (
          id, userId, lessonId, blockId, assignmentRecipientId, status, completedAt, pendingSync
        )
        VALUES (?, ?, ?, ?, ?, 'completed', ?, 1)
        `,
        [uuid(), userId, lessonId, blockId, context?.assignmentRecipientId, now]
      );
    } else {
      await execute(
        `
        INSERT INTO ${table} (
          id, userId, lessonId, blockId, status, completedAt, pendingSync
        )
        VALUES (?, ?, ?, ?, 'completed', ?, 1)
        `,
        [uuid(), userId, lessonId, blockId, now]
      );
    }
  }

  await recomputeLessonCompletion(userId, lessonId, context);
}

export async function submitSingleChoiceAnswer(
  userId: string,
  lessonId: string,
  blockId: string,
  selectedOptionId: string,
  context?: TrainingProgressContext
): Promise<{ isCorrect: boolean }> {
  const table = getBlockProgressTable(context);
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
  const assignmentFilter = isAssignmentContext(context)
    ? ` AND assignmentRecipientId=?`
    : "";
  const existingParams = isAssignmentContext(context)
    ? [userId, blockId, context?.assignmentRecipientId]
    : [userId, blockId];
  const existing = await execute(
    `SELECT id FROM ${table} WHERE userId=? AND blockId=?${assignmentFilter}`,
    existingParams
  );

  if (existing.rows.length) {
    if (isAssignmentContext(context)) {
      await execute(
        `
        UPDATE ${table}
        SET status=?, selectedOptionId=?, isCorrect=?, completedAt=?, pendingSync=1
        WHERE userId=? AND blockId=? AND assignmentRecipientId=?
        `,
        [
          status,
          selectedOptionId,
          isCorrect ? 1 : 0,
          isCorrect ? now : null,
          userId,
          blockId,
          context?.assignmentRecipientId,
        ]
      );
    } else {
      await execute(
        `
        UPDATE ${table}
        SET status=?, selectedOptionId=?, isCorrect=?, completedAt=?, pendingSync=1
        WHERE userId=? AND blockId=?
        `,
        [status, selectedOptionId, isCorrect ? 1 : 0, isCorrect ? now : null, userId, blockId]
      );
    }
  } else {
    if (isAssignmentContext(context)) {
      await execute(
        `
        INSERT INTO ${table} (
          id, userId, lessonId, blockId, assignmentRecipientId, status, selectedOptionId, isCorrect, completedAt, pendingSync
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
        `,
        [
          uuid(),
          userId,
          lessonId,
          blockId,
          context?.assignmentRecipientId,
          status,
          selectedOptionId,
          isCorrect ? 1 : 0,
          isCorrect ? now : null,
        ]
      );
    } else {
      await execute(
        `
        INSERT INTO ${table} (
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
  }

  await recomputeLessonCompletion(userId, lessonId, context);
  return { isCorrect };
}

export async function getProgressMap(
  userId: string,
  context?: TrainingProgressContext
): Promise<Record<string, LessonProgress>> {
  const table = getLessonProgressTable(context);
  const assignmentFilter = isAssignmentContext(context)
    ? ` AND assignmentRecipientId=?`
    : "";
  const params = isAssignmentContext(context)
    ? [userId, context?.assignmentRecipientId]
    : [userId];
  const res = await execute(`SELECT * FROM ${table} WHERE userId=?${assignmentFilter}`, params);
  const map: Record<string, LessonProgress> = {};
  res.rows.forEach((r: any) => {
    map[r.lessonId] = {
      ...r,
      source: isAssignmentContext(context) ? "assignment" : "b2c",
      assignmentRecipientId: r.assignmentRecipientId ?? context?.assignmentRecipientId ?? null,
    };
  });
  return map;
}

export async function getAssignmentLessonProgressMap(
  userId: string
): Promise<Record<string, LessonProgress>> {
  const res = await execute(
    `
    SELECT *
    FROM AssignmentLessonProgress
    WHERE userId=?
    `,
    [userId]
  );
  const map: Record<string, LessonProgress> = {};
  res.rows.forEach((r: any) => {
    if (!r.assignmentRecipientId) return;
    map[r.assignmentRecipientId] = {
      ...r,
      source: "assignment",
      assignmentRecipientId: r.assignmentRecipientId,
    };
  });
  return map;
}

export async function listPendingLessonProgress(
  userId: string
): Promise<LessonProgress[]> {
  const res = await execute(
    `
    SELECT *
    FROM LessonProgress
    WHERE userId=? AND pendingSync=1
    ORDER BY lastViewedAt ASC
    `,
    [userId]
  );
  return (res.rows as LessonProgress[]).map((row) => ({
    ...row,
    source: "b2c",
    assignmentRecipientId: null,
  }));
}

export async function listPendingTrainingBlockProgress(
  userId: string
): Promise<TrainingBlockProgress[]> {
  const res = await execute(
    `
    SELECT *
    FROM TrainingBlockProgress
    WHERE userId=? AND pendingSync=1
    ORDER BY completedAt ASC
    `,
    [userId]
  );
  return (res.rows as TrainingBlockProgress[]).map((row) => ({
    ...row,
    source: "b2c",
    assignmentRecipientId: null,
  }));
}

export async function listPendingAssignmentLessonProgress(
  userId: string
): Promise<LessonProgress[]> {
  const res = await execute(
    `
    SELECT *
    FROM AssignmentLessonProgress
    WHERE userId=? AND pendingSync=1
    ORDER BY lastViewedAt ASC
    `,
    [userId]
  );
  return (res.rows as LessonProgress[]).map((row) => ({
    ...row,
    source: "assignment",
    assignmentRecipientId: row.assignmentRecipientId ?? null,
  }));
}

export async function listPendingAssignmentTrainingBlockProgress(
  userId: string
): Promise<TrainingBlockProgress[]> {
  const res = await execute(
    `
    SELECT *
    FROM AssignmentTrainingBlockProgress
    WHERE userId=? AND pendingSync=1
    ORDER BY completedAt ASC
    `,
    [userId]
  );
  return (res.rows as TrainingBlockProgress[]).map((row) => ({
    ...row,
    source: "assignment",
    assignmentRecipientId: row.assignmentRecipientId ?? null,
  }));
}

export async function markLessonProgressSynced(ids: string[]): Promise<void> {
  if (!ids.length) return;

  const placeholders = ids.map(() => "?").join(", ");
  await execute(
    `UPDATE LessonProgress SET pendingSync=0 WHERE id IN (${placeholders})`,
    ids
  );
}

export async function markAssignmentLessonProgressSynced(ids: string[]): Promise<void> {
  if (!ids.length) return;

  const placeholders = ids.map(() => "?").join(", ");
  await execute(
    `UPDATE AssignmentLessonProgress SET pendingSync=0 WHERE id IN (${placeholders})`,
    ids
  );
}

export async function markTrainingBlockProgressSynced(
  ids: string[]
): Promise<void> {
  if (!ids.length) return;

  const placeholders = ids.map(() => "?").join(", ");
  await execute(
    `UPDATE TrainingBlockProgress SET pendingSync=0 WHERE id IN (${placeholders})`,
    ids
  );
}

export async function markAssignmentTrainingBlockProgressSynced(
  ids: string[]
): Promise<void> {
  if (!ids.length) return;

  const placeholders = ids.map(() => "?").join(", ");
  await execute(
    `UPDATE AssignmentTrainingBlockProgress SET pendingSync=0 WHERE id IN (${placeholders})`,
    ids
  );
}

export async function cacheRemoteLessonProgress(
  rows: LessonProgress[]
): Promise<void> {
  for (const row of rows) {
    await execute(
      `
      INSERT OR REPLACE INTO LessonProgress (id, userId, lessonId, completion, lastViewedAt, pendingSync)
      VALUES (?, ?, ?, ?, ?, 0)
      `,
      [row.id, row.userId, row.lessonId, row.completion, row.lastViewedAt ?? null]
    );
  }
}

export async function cacheRemoteAssignmentLessonProgress(
  rows: LessonProgress[]
): Promise<void> {
  for (const row of rows) {
    if (!row.assignmentRecipientId) continue;

    await execute(
      `
      INSERT OR REPLACE INTO AssignmentLessonProgress (
        id, userId, lessonId, assignmentRecipientId, completion, lastViewedAt, pendingSync
      )
      VALUES (?, ?, ?, ?, ?, ?, 0)
      `,
      [
        row.id,
        row.userId,
        row.lessonId,
        row.assignmentRecipientId,
        row.completion,
        row.lastViewedAt ?? null,
      ]
    );
  }
}

export async function cacheRemoteTrainingBlockProgress(
  rows: TrainingBlockProgress[]
): Promise<void> {
  for (const row of rows) {
    await execute(
      `
      INSERT OR REPLACE INTO TrainingBlockProgress (
        id, userId, lessonId, blockId, status, selectedOptionId, isCorrect, completedAt, pendingSync
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
      `,
      [
        row.id,
        row.userId,
        row.lessonId,
        row.blockId,
        row.status,
        row.selectedOptionId ?? null,
        row.isCorrect ?? null,
        row.completedAt ?? null,
      ]
    );
  }
}

export async function cacheRemoteAssignmentTrainingBlockProgress(
  rows: TrainingBlockProgress[]
): Promise<void> {
  for (const row of rows) {
    if (!row.assignmentRecipientId) continue;

    await execute(
      `
      INSERT OR REPLACE INTO AssignmentTrainingBlockProgress (
        id, userId, lessonId, blockId, assignmentRecipientId, status, selectedOptionId, isCorrect, completedAt, pendingSync
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
      `,
      [
        row.id,
        row.userId,
        row.lessonId,
        row.blockId,
        row.assignmentRecipientId,
        row.status,
        row.selectedOptionId ?? null,
        row.isCorrect ?? null,
        row.completedAt ?? null,
      ]
    );
  }
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

export async function createLessonWithBlocks(input: {
  title: string;
  summary: string;
  order?: number;
  blocks: LessonBlockInput[];
}): Promise<Lesson> {
  const lesson = await createLesson({
    title: input.title,
    summary: input.summary,
    content: blockInputToLegacyContent(input.blocks),
    order: input.order,
  });

  await replaceLessonBlocks(lesson.id, input.blocks);
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

export async function updateLessonWithBlocks(
  id: string,
  patch: {
    title: string;
    summary: string;
    order?: number;
    blocks: LessonBlockInput[];
  }
): Promise<void> {
  await updateLesson(id, {
    title: patch.title,
    summary: patch.summary,
    content: blockInputToLegacyContent(patch.blocks),
    order: patch.order,
  });
  await replaceLessonBlocks(id, patch.blocks);
}

/**
 * Delete a lesson + related progress rows
 */
export async function deleteLesson(id: string): Promise<void> {
  // cleanup progress first (safe even if no rows)
  await execute(`DELETE FROM TrainingBlockOption WHERE blockId IN (
    SELECT id FROM TrainingBlock WHERE lessonId=?
  )`, [id]);
  await execute(`DELETE FROM TrainingBlockProgress WHERE lessonId=?`, [id]);
  await execute(`DELETE FROM AssignmentTrainingBlockProgress WHERE lessonId=?`, [id]);
  await execute(`DELETE FROM TrainingBlock WHERE lessonId=?`, [id]);
  await execute(`DELETE FROM LessonProgress WHERE lessonId=?`, [id]);
  await execute(`DELETE FROM AssignmentLessonProgress WHERE lessonId=?`, [id]);

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
