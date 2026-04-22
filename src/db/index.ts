// db/src/db/index.ts
import * as SQLite from "expo-sqlite";

export type SQLResult = {
  rows: any[];             // rezultate SELECT
  rowsAffected: number;    // # rânduri modificate
  insertId?: number;       // id ultimul INSERT (dacă e cazul)
};

let db: SQLite.SQLiteDatabase | null = null;

export function getDB() {
  // Poți schimba numele (ex. "phishguard.v2.db") dacă vrei un reset rapid al fișierului
  if (!db) db = SQLite.openDatabaseSync("phishguard.db");
  return db!;
}

/**
 * execute: wrapper simplu peste API-ul async modern.
 * - SELECT → getAllAsync (returnează array de obiecte)
 * - non-SELECT → runAsync (returnează { changes, lastInsertRowId })
 */
export async function execute(sql: string, params: any[] = []): Promise<SQLResult> {
  const database = getDB();
  const isSelect = /^\s*select/i.test(sql);

  if (isSelect) {
    const rows = await database.getAllAsync(sql, params);
    return { rows: rows as any[], rowsAffected: 0 };
  } else {
    const res = await database.runAsync(sql, params);
    return {
      rows: [],
      rowsAffected: res.changes ?? 0,
      insertId: (res as any).lastInsertRowId,
    };
  }
}

/** helper: rulează mai multe statement-uri secvențial într-o tranzacție activă */
async function runStatementsInTx(statements: string[]) {
  const database = getDB();
  for (const stmt of statements) {
    const s = stmt.trim();
    if (!s) continue;
    await database.runAsync(s);
  }
}

/** helper: aplică o migrare o singură dată, în tranzacție */
async function applyMigration(name: string, statements: string[]) {
  const database = getDB();
  const existing = await database.getAllAsync(
    `SELECT name FROM _migrations_ WHERE name=?`,
    [name]
  );
  if (existing.length > 0) return; // deja aplicată

  await database.withTransactionAsync(async () => {
    await runStatementsInTx(statements);
    await database.runAsync(
      `INSERT INTO _migrations_ (name, applied_at) VALUES (?, ?)`,
      [name, Date.now()]
    );
  });
}

export async function runMigrations() {
  const database = getDB();

  // 0) Asigurăm tabela de migrații (în afara oricărei tranzacții)
  await database.runAsync(`
    CREATE TABLE IF NOT EXISTS _migrations_ (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      applied_at INTEGER NOT NULL
    );
  `);

  // --- MIGRATION 001: Lessons + LessonProgress ---
  await applyMigration("001-lessons-and-progress", [
    `
    CREATE TABLE IF NOT EXISTS Lesson (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      summary TEXT NOT NULL,
      content TEXT NOT NULL,
      "order" INTEGER NOT NULL DEFAULT 0
    )
    `,
    `CREATE INDEX IF NOT EXISTS idx_Lesson_order ON Lesson("order")`,

    `
    CREATE TABLE IF NOT EXISTS LessonProgress (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      lessonId TEXT NOT NULL,
      completion INTEGER NOT NULL DEFAULT 0,
      lastViewedAt INTEGER,
      pendingSync INTEGER NOT NULL DEFAULT 0,
      UNIQUE(userId, lessonId)
    )
    `,
    `CREATE INDEX IF NOT EXISTS idx_LessonProgress_user ON LessonProgress(userId)`,
    `CREATE INDEX IF NOT EXISTS idx_LessonProgress_lesson ON LessonProgress(lessonId)`,
  ]);

  // --- MIGRATION 002: Quiz schema (Classic + Visual + Attempts) ---
  await applyMigration("002-quiz-schema", [
    `
    CREATE TABLE IF NOT EXISTS Quiz (
      id TEXT PRIMARY KEY,
      slug TEXT UNIQUE NOT NULL,        -- ex: "classic", "visual"
      title TEXT NOT NULL,
      description TEXT,
      kind TEXT NOT NULL                -- "classic" | "visual"
    )
    `,
    `CREATE INDEX IF NOT EXISTS idx_Quiz_kind ON Quiz(kind)`,

    `
    CREATE TABLE IF NOT EXISTS Question (
      id TEXT PRIMARY KEY,
      quizId TEXT NOT NULL,
      text TEXT NOT NULL,
      explanation TEXT,
      "order" INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (quizId) REFERENCES Quiz(id) ON DELETE CASCADE
    )
    `,
    `CREATE INDEX IF NOT EXISTS idx_Question_quiz ON Question(quizId)`,

    `
    CREATE TABLE IF NOT EXISTS Option (
      id TEXT PRIMARY KEY,
      questionId TEXT NOT NULL,
      text TEXT NOT NULL,
      isCorrect INTEGER NOT NULL DEFAULT 0,
      "order" INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (questionId) REFERENCES Question(id) ON DELETE CASCADE
    )
    `,
    `CREATE INDEX IF NOT EXISTS idx_Option_question ON Option(questionId)`,

    `
    CREATE TABLE IF NOT EXISTS VisualCard (
      id TEXT PRIMARY KEY,
      quizId TEXT NOT NULL,
      asset TEXT NOT NULL,              -- ex: "visual/fake_login.png"
      label TEXT,
      isPhish INTEGER NOT NULL,         -- 1/0
      "order" INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (quizId) REFERENCES Quiz(id) ON DELETE CASCADE
    )
    `,
    `CREATE INDEX IF NOT EXISTS idx_VisualCard_quiz ON VisualCard(quizId)`,

    `
    CREATE TABLE IF NOT EXISTS QuizAttempt (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      quizId TEXT NOT NULL,
      score INTEGER NOT NULL DEFAULT 0,
      startedAt INTEGER NOT NULL,
      finishedAt INTEGER,
      pendingSync INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (quizId) REFERENCES Quiz(id) ON DELETE CASCADE
    )
    `,
    `CREATE INDEX IF NOT EXISTS idx_Attempt_user ON QuizAttempt(userId)`,
    `CREATE INDEX IF NOT EXISTS idx_Attempt_quiz ON QuizAttempt(quizId)`,
  ]);

  // --- MIGRATION 003: UserProfile (roles) ---
  await applyMigration("003-user-profile-roles", [
    `
    CREATE TABLE IF NOT EXISTS UserProfile (
      userId TEXT PRIMARY KEY,
      email TEXT,
      role TEXT NOT NULL,
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL
    )
    `,
    `CREATE INDEX IF NOT EXISTS idx_UserProfile_role ON UserProfile(role)`,
  ]);

  // --- MIGRATION 004: QuizAttempt variant tracking for visual quiz levels ---
  await applyMigration("004-quiz-attempt-variant", [
    `ALTER TABLE QuizAttempt ADD COLUMN variant TEXT`,
    `CREATE INDEX IF NOT EXISTS idx_Attempt_variant ON QuizAttempt(variant)`,
  ]);

  // --- MIGRATION 005: VisualCard difficulty levels ---
  await applyMigration("005-visual-card-variant", [
    `ALTER TABLE VisualCard ADD COLUMN variant TEXT`,
    `
    UPDATE VisualCard
    SET variant = CASE
      WHEN "order" <= (
        SELECT CAST(COUNT(*) / 3 AS INTEGER) +
          CASE WHEN COUNT(*) % 3 > 0 THEN 1 ELSE 0 END
        FROM VisualCard vc2
        WHERE vc2.quizId = VisualCard.quizId
      ) THEN 'beginner'
      WHEN "order" <= (
        SELECT
          (CAST(COUNT(*) / 3 AS INTEGER) +
            CASE WHEN COUNT(*) % 3 > 0 THEN 1 ELSE 0 END) +
          (CAST(COUNT(*) / 3 AS INTEGER) +
            CASE WHEN COUNT(*) % 3 > 1 THEN 1 ELSE 0 END)
        FROM VisualCard vc2
        WHERE vc2.quizId = VisualCard.quizId
      ) THEN 'intermediate'
      ELSE 'expert'
    END
    WHERE variant IS NULL
    `,
    `CREATE INDEX IF NOT EXISTS idx_VisualCard_quiz_variant ON VisualCard(quizId, variant)`,
  ]);

  // --- MIGRATION 006: Achievements unlocked by user ---
  await applyMigration("006-achievements", [
    `
    CREATE TABLE IF NOT EXISTS AchievementUnlock (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      achievementId TEXT NOT NULL,
      unlockedAt INTEGER NOT NULL,
      UNIQUE(userId, achievementId)
    )
    `,
    `CREATE INDEX IF NOT EXISTS idx_AchievementUnlock_user ON AchievementUnlock(userId)`,
    `CREATE INDEX IF NOT EXISTS idx_AchievementUnlock_achievement ON AchievementUnlock(achievementId)`,
  ]);

  // --- MIGRATION 007: Block-based training content ---
  await applyMigration("007-training-blocks", [
    `
    CREATE TABLE IF NOT EXISTS TrainingBlock (
      id TEXT PRIMARY KEY,
      lessonId TEXT NOT NULL,
      type TEXT NOT NULL,
      title TEXT,
      body TEXT,
      "order" INTEGER NOT NULL DEFAULT 0,
      isRequired INTEGER NOT NULL DEFAULT 1,
      pendingSync INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (lessonId) REFERENCES Lesson(id) ON DELETE CASCADE
    )
    `,
    `CREATE INDEX IF NOT EXISTS idx_TrainingBlock_lesson ON TrainingBlock(lessonId)`,
    `CREATE INDEX IF NOT EXISTS idx_TrainingBlock_lesson_order ON TrainingBlock(lessonId, "order")`,

    `
    CREATE TABLE IF NOT EXISTS TrainingBlockOption (
      id TEXT PRIMARY KEY,
      blockId TEXT NOT NULL,
      label TEXT NOT NULL,
      isCorrect INTEGER NOT NULL DEFAULT 0,
      "order" INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (blockId) REFERENCES TrainingBlock(id) ON DELETE CASCADE
    )
    `,
    `CREATE INDEX IF NOT EXISTS idx_TrainingBlockOption_block ON TrainingBlockOption(blockId)`,

    `
    CREATE TABLE IF NOT EXISTS TrainingBlockProgress (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      lessonId TEXT NOT NULL,
      blockId TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'not_started',
      selectedOptionId TEXT,
      isCorrect INTEGER,
      completedAt INTEGER,
      pendingSync INTEGER NOT NULL DEFAULT 0,
      UNIQUE(userId, blockId)
    )
    `,
    `CREATE INDEX IF NOT EXISTS idx_TrainingBlockProgress_user_lesson ON TrainingBlockProgress(userId, lessonId)`,
    `CREATE INDEX IF NOT EXISTS idx_TrainingBlockProgress_user_block ON TrainingBlockProgress(userId, blockId)`,
  ]);
}
