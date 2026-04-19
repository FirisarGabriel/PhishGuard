import { execute, getDB } from "../db";
import { v4 as uuid } from "uuid";
import type {
  VisualQuizEditableVariantId,
  VisualQuizVariantId,
} from "../visualQuiz";
import type {
  Quiz,
  Question,
  Option,
  VisualCard as VisualCardRow,
  QuizAttempt,
} from "../types/models";

type QuizKind = "classic" | "visual";

function visualCardVariantOrderSql() {
  return `CASE variant
    WHEN 'beginner' THEN 0
    WHEN 'intermediate' THEN 1
    WHEN 'expert' THEN 2
    ELSE 3
  END`;
}

/** ─────────────────────────────
 *  Quizzes
 *  ────────────────────────────*/
export async function getQuizBySlug(slug: string): Promise<Quiz | null> {
  const r = await execute(`SELECT * FROM Quiz WHERE slug=? LIMIT 1`, [slug]);
  return (r.rows?.[0] as Quiz) ?? null;
}

export async function getQuizById(id: string): Promise<Quiz | null> {
  const r = await execute(`SELECT * FROM Quiz WHERE id=? LIMIT 1`, [id]);
  return (r.rows?.[0] as Quiz) ?? null;
}

export async function getQuizzesByKind(kind: QuizKind): Promise<Quiz[]> {
  const r = await execute(`SELECT * FROM Quiz WHERE kind=? ORDER BY title ASC`, [
    kind,
  ]);
  return r.rows as Quiz[];
}

/**
 * Best score per quiz for a given user, filtered by kind.
 * Returns: { [quizId]: bestScore }
 */
export async function getBestScoresMapForKind(
  userId: string,
  kind: QuizKind
): Promise<Record<string, number>> {
  const r = await execute(
    `
    SELECT qa.quizId as quizId, MAX(qa.score) as best
    FROM QuizAttempt qa
    JOIN Quiz q ON q.id = qa.quizId
    WHERE qa.userId=? AND q.kind=? AND qa.finishedAt IS NOT NULL
    GROUP BY qa.quizId
  `,
    [userId, kind]
  );

  const map: Record<string, number> = {};
  r.rows.forEach((row: any) => {
    map[String(row.quizId)] = Number(row.best ?? 0);
  });
  return map;
}

export async function getLatestVisualScoresMap(
  userId: string,
  quizId: string
): Promise<Partial<Record<VisualQuizVariantId, number>>> {
  const r = await execute(
    `
    SELECT variant, score
    FROM QuizAttempt
    WHERE userId=? AND quizId=? AND finishedAt IS NOT NULL AND variant IS NOT NULL
    ORDER BY finishedAt DESC, startedAt DESC
  `,
    [userId, quizId]
  );

  const map: Partial<Record<VisualQuizVariantId, number>> = {};

  r.rows.forEach((row: any) => {
    const variant = row?.variant as VisualQuizVariantId | undefined;
    if (!variant || map[variant] !== undefined) {
      return;
    }

    map[variant] = Number(row?.score ?? 0);
  });

  return map;
}

/** ─────────────────────────────
 *  Questions & Options
 *  ────────────────────────────*/
export async function getQuestions(quizId: string): Promise<Question[]> {
  const r = await execute(
    `SELECT * FROM Question WHERE quizId=? ORDER BY "order" ASC`,
    [quizId]
  );
  return r.rows as Question[];
}

export async function getOptions(questionId: string): Promise<Option[]> {
  const r = await execute(
    `SELECT * FROM Option WHERE questionId=? ORDER BY "order" ASC`,
    [questionId]
  );
  return r.rows as Option[];
}

/** Optional helper: fetch all questions with options in one call */
export async function getQuestionsWithOptions(
  quizId: string
): Promise<Array<Question & { options: Option[] }>> {
  const questions = await getQuestions(quizId);
  const out: Array<Question & { options: Option[] }> = [];
  for (const q of questions) {
    const opts = await getOptions(q.id);
    out.push({ ...q, options: opts });
  }
  return out;
}

export async function getVisualCards(quizId: string): Promise<VisualCardRow[]> {
  const r = await execute(
    `
    SELECT *
    FROM VisualCard
    WHERE quizId=?
    ORDER BY ${visualCardVariantOrderSql()} ASC, "order" ASC
    `,
    [quizId]
  );
  return r.rows as VisualCardRow[];
}

export async function getNextVisualCardOrder(
  quizId: string,
  variant: VisualQuizEditableVariantId
): Promise<number> {
  const r = await execute(
    `SELECT MAX("order") as m FROM VisualCard WHERE quizId=? AND variant=?`,
    [quizId, variant]
  );
  const maxOrder = Number(r.rows?.[0]?.m ?? 0);
  return (Number.isFinite(maxOrder) ? maxOrder : 0) + 1;
}

export async function createVisualCard(input: {
  quizId: string;
  asset: string;
  label?: string | null;
  isPhish: boolean | 0 | 1;
  variant: VisualQuizEditableVariantId;
  order?: number;
}): Promise<VisualCardRow> {
  const id = uuid();
  const order =
    typeof input.order === "number"
      ? input.order
      : await getNextVisualCardOrder(input.quizId, input.variant);

  const row: VisualCardRow = {
    id,
    quizId: input.quizId,
    asset: input.asset,
    label: input.label ?? (input.isPhish ? "PHISHING" : "LEGIT"),
    isPhish: input.isPhish ? 1 : 0,
    variant: input.variant,
    order,
  };

  await execute(
    `INSERT INTO VisualCard (id, quizId, asset, label, isPhish, variant, "order")
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      row.id,
      row.quizId,
      row.asset,
      row.label,
      row.isPhish,
      row.variant,
      row.order,
    ]
  );

  return row;
}

export async function updateVisualCardVariant(
  cardId: string,
  variant: VisualQuizEditableVariantId
): Promise<void> {
  const r = await execute(`SELECT * FROM VisualCard WHERE id=? LIMIT 1`, [cardId]);
  const card = (r.rows?.[0] as VisualCardRow | undefined) ?? null;

  if (!card) {
    throw new Error("Visual card not found.");
  }

  if ((card.variant ?? "beginner") === variant) {
    return;
  }

  const nextOrder = await getNextVisualCardOrder(card.quizId, variant);
  await execute(`UPDATE VisualCard SET variant=?, "order"=? WHERE id=?`, [
    variant,
    nextOrder,
    cardId,
  ]);
}

export async function deleteVisualCard(cardId: string): Promise<void> {
  await execute(`DELETE FROM VisualCard WHERE id=?`, [cardId]);
}

export async function moveVisualCard(
  quizId: string,
  cardId: string,
  direction: "up" | "down",
  variant: VisualQuizEditableVariantId
): Promise<void> {
  const cards = (await getVisualCards(quizId)).filter(
    (card) => (card.variant ?? "beginner") === variant
  );
  const currentIndex = cards.findIndex((card) => card.id === cardId);

  if (currentIndex < 0) {
    throw new Error("Visual card not found.");
  }

  const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
  if (targetIndex < 0 || targetIndex >= cards.length) {
    return;
  }

  const currentCard = cards[currentIndex];
  const targetCard = cards[targetIndex];
  const database = getDB();

  await database.withTransactionAsync(async () => {
    await database.runAsync(
      `UPDATE VisualCard SET "order"=? WHERE id=?`,
      [targetCard.order, currentCard.id]
    );
    await database.runAsync(
      `UPDATE VisualCard SET "order"=? WHERE id=?`,
      [currentCard.order, targetCard.id]
    );
  });
}

/** ─────────────────────────────
 *  Attempts (start / finish / testing)
 *  ────────────────────────────*/
export async function startAttempt(
  userId: string,
  quizId: string,
  options?: { variant?: VisualQuizVariantId }
): Promise<string> {
  const id = uuid();
  await execute(
    `INSERT INTO QuizAttempt (id, userId, quizId, score, startedAt, variant, pendingSync)
     VALUES (?, ?, ?, ?, ?, ?, 1)`,
    [id, userId, quizId, 0, Date.now(), options?.variant ?? null]
  );
  return id;
}

export async function finishAttempt(attemptId: string, score: number) {
  await execute(
    `UPDATE QuizAttempt SET score=?, finishedAt=?, pendingSync=1 WHERE id=?`,
    [score, Date.now(), attemptId]
  );
}

export async function getAttemptsForQuiz(
  userId: string,
  quizId: string
): Promise<QuizAttempt[]> {
  const r = await execute(
    `SELECT * FROM QuizAttempt WHERE userId=? AND quizId=? ORDER BY startedAt DESC`,
    [userId, quizId]
  );
  return r.rows as QuizAttempt[];
}

/** testing helpers */
export async function resetAllAttempts(userId: string) {
  await execute(`DELETE FROM QuizAttempt WHERE userId=?`, [userId]);
}

/** ─────────────────────────────
 *  ADMIN CRUD for Quiz metadata (simple)
 *  ────────────────────────────*/

/** slug helper */
function slugifyTitle(t: string) {
  return t
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function existsQuizWithSlug(slug: string): Promise<boolean> {
  const r = await execute(`SELECT COUNT(*) as c FROM Quiz WHERE slug=?`, [slug]);
  return (r.rows?.[0]?.c ?? 0) > 0;
}

/**
 * Ensure unique slug by appending -1, -2... if needed.
 */
async function makeUniqueSlug(base: string): Promise<string> {
  let slug = base;
  let i = 1;
  while (await existsQuizWithSlug(slug)) {
    slug = `${base}-${i++}`;
  }
  return slug;
}

/**
 * Create a quiz (returns the created Quiz)
 */
export async function createQuiz(input: {
  title: string;
  description?: string | null;
  kind?: QuizKind;
  slug?: string;
}): Promise<Quiz> {
  const id = uuid();
  const title = input.title.trim();
  const baseSlug = input.slug ? slugifyTitle(input.slug) : slugifyTitle(title);
  const slug = await makeUniqueSlug(baseSlug);
  const kind: QuizKind = input.kind ?? "classic";

  const quiz: Quiz = {
    id,
    slug,
    title,
    description: input.description ?? undefined,
    kind,
  };

  await execute(
    `INSERT INTO Quiz (id, slug, title, description, kind) VALUES (?, ?, ?, ?, ?)`,
    [quiz.id, quiz.slug, quiz.title, quiz.description, quiz.kind]
  );

  return quiz;
}

/**
 * Update quiz metadata (title/description/slug)
 */
export async function updateQuiz(
  id: string,
  patch: Partial<Pick<Quiz, "title" | "description" | "slug">>
): Promise<void> {
  const current = await getQuizById(id);
  if (!current) throw new Error("Quiz not found.");

  const nextTitle =
    patch.title !== undefined ? patch.title.trim() : current.title;

  let nextSlug = current.slug;
  if (patch.slug !== undefined) {
    const base = slugifyTitle(patch.slug || nextTitle);
    if (base !== current.slug) {
      nextSlug = await makeUniqueSlug(base);
    }
  } else if (patch.title !== undefined) {
    const base = slugifyTitle(nextTitle);
    if (base !== current.slug) {
      nextSlug = await makeUniqueSlug(base);
    }
  }

  const nextDesc =
    patch.description !== undefined ? patch.description : current.description;

  await execute(
    `UPDATE Quiz SET title=?, description=?, slug=? WHERE id=?`,
    [nextTitle, nextDesc, nextSlug, id]
  );
}

/**
 * Delete quiz + related rows (questions/options/attempts/visualcards)
 */
export async function deleteQuiz(quizId: string): Promise<void> {
  await execute(
    `DELETE FROM Option WHERE questionId IN (SELECT id FROM Question WHERE quizId=?)`,
    [quizId]
  );

  await execute(`DELETE FROM Question WHERE quizId=?`, [quizId]);

  await execute(`DELETE FROM VisualCard WHERE quizId=?`, [quizId]);

  await execute(`DELETE FROM QuizAttempt WHERE quizId=?`, [quizId]);

  await execute(`DELETE FROM Quiz WHERE id=?`, [quizId]);
}

/** ─────────────────────────────
 *  ADMIN CRUD: Questions + Options (Classic editor)
 *  ────────────────────────────*/

export async function getQuestionById(id: string): Promise<Question | null> {
  const r = await execute(`SELECT * FROM Question WHERE id=? LIMIT 1`, [id]);
  return (r.rows?.[0] as Question) ?? null;
}

export async function getQuestionsForQuiz(quizId: string): Promise<Question[]> {
  const r = await execute(
    `SELECT * FROM Question WHERE quizId=? ORDER BY "order" ASC`,
    [quizId]
  );
  return r.rows as Question[];
}

export async function getOptionsForQuestion(
  questionId: string
): Promise<Option[]> {
  const r = await execute(
    `SELECT * FROM Option WHERE questionId=? ORDER BY "order" ASC`,
    [questionId]
  );
  return r.rows as Option[];
}

export async function getNextQuestionOrder(quizId: string): Promise<number> {
  const r = await execute(
    `SELECT MAX("order") as m FROM Question WHERE quizId=?`,
    [quizId]
  );
  const maxOrder = Number(r.rows?.[0]?.m ?? 0);
  return (Number.isFinite(maxOrder) ? maxOrder : 0) + 1;
}

export async function createQuestion(input: {
  quizId: string;
  text: string;
  explanation?: string | null;
  order?: number;
}): Promise<Question> {
  const id = uuid();
  const order =
    typeof input.order === "number"
      ? input.order
      : await getNextQuestionOrder(input.quizId);

  const q: Question = {
    id,
    quizId: input.quizId,
    text: input.text.trim(),
    explanation: input.explanation ?? undefined,
    order,
  };

  await execute(
    `INSERT INTO Question (id, quizId, text, explanation, "order")
     VALUES (?, ?, ?, ?, ?)`,
    [q.id, q.quizId, q.text, q.explanation, q.order]
  );

  return q;
}

export async function updateQuestion(
  id: string,
  patch: Partial<Pick<Question, "text" | "explanation" | "order">>
): Promise<void> {
  const current = await getQuestionById(id);
  if (!current) throw new Error("Question not found.");

  const nextText =
    patch.text !== undefined ? patch.text.trim() : current.text;
  const nextExplanation =
    patch.explanation !== undefined ? patch.explanation : current.explanation;
  const nextOrder =
    typeof patch.order === "number" ? patch.order : current.order;

  await execute(
    `UPDATE Question SET text=?, explanation=?, "order"=? WHERE id=?`,
    [nextText, nextExplanation, nextOrder, id]
  );
}

export async function deleteQuestion(questionId: string): Promise<void> {
  await execute(`DELETE FROM Option WHERE questionId=?`, [questionId]);
  await execute(`DELETE FROM Question WHERE id=?`, [questionId]);
}

/**
 * Simplificare mare:
 * - la Save, ștergem opțiunile existente și le re-inserăm în ordinea curentă.
 * - e mult mai simplu decât upsert granular.
 */
export async function replaceOptions(
  questionId: string,
  options: Array<{ text: string; isCorrect: boolean }>
): Promise<void> {
  await execute(`DELETE FROM Option WHERE questionId=?`, [questionId]);

  let order = 1;
  for (const o of options) {
    await execute(
      `INSERT INTO Option (id, questionId, text, isCorrect, "order")
       VALUES (?, ?, ?, ?, ?)`,
      [uuid(), questionId, o.text.trim(), o.isCorrect ? 1 : 0, order++]
    );
  }
}