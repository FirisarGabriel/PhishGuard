import { execute } from "./index";
import "react-native-get-random-values";
import { v4 as uuid } from "uuid";

import { QUIZ_QUESTIONS, type QuizQuestion } from "../mockClassicQuiz";
import { VISUAL_CARDS } from "../mockVisualQuiz";
import { getDefaultVisualCardVariantByIndex } from "../visualQuiz";

type SeedQuestionOption = {
  label: string;
  isCorrect: boolean;
};

type SeedBlock = {
  type: "text" | "question_single";
  title: string;
  body: string;
  isRequired?: boolean;
  options?: SeedQuestionOption[];
};

type SeedLesson = {
  title: string;
  legacyTitles: string[];
  summary: string;
  order: number;
  blocks: SeedBlock[];
};

const LESSONS_SEED_VERSION = "2026-04-22-v3-structured-blocks";
const LESSON_BLOCKS_SEED_VERSION = "2026-04-22-v3-structured-blocks";

const SEED_LESSONS: SeedLesson[] = [
  {
    title: "Spot Suspicious Links Before You Tap",
    legacyTitles: ["Spotting Suspicious Links"],
    summary: "Learn how to inspect domains, redirects, and shortened links before clicking.",
    order: 1,
    blocks: [
      {
        type: "text",
        title: "Why links are dangerous",
        body:
          "Most phishing attempts do not need malware. They only need one click on a fake login page. Attackers rely on users reacting fast instead of checking where a link really goes.",
      },
      {
        type: "question_single",
        title: "Checkpoint",
        body: "What should you verify first when a message asks you to click a link urgently?",
        options: [
          { label: "Whether the email uses a formal greeting.", isCorrect: false },
          { label: "The real destination domain behind the link.", isCorrect: true },
          { label: "Whether the sender included a signature.", isCorrect: false },
        ],
      },
      {
        type: "text",
        title: "What to inspect",
        body:
          "Look at the main domain, not just the first words in the URL. Attackers often hide fake destinations inside long subdomains like paypal.com.verify-login.example.ru. Also treat shortened URLs and IP-based links as high risk until verified.",
      },
      {
        type: "question_single",
        title: "Quick decision",
        body: "Which link is the safest sign of a legitimate destination?",
        options: [
          { label: "https://microsoft.com.security-check.example.org", isCorrect: false },
          { label: "https://login.microsoftonline.com", isCorrect: true },
          { label: "https://microsoft-login-help.net", isCorrect: false },
        ],
      },
      {
        type: "text",
        title: "Takeaway",
        body:
          "When the stakes are high, never trust a link just because it looks familiar at first glance. Slow down, inspect the domain, and use bookmarks or the official app when possible.",
      },
    ],
  },
  {
    title: "Resist Urgency and Fear Tactics",
    legacyTitles: ["Urgency and Fear Tactics"],
    summary: "Recognize emotional pressure and pause before acting on threatening messages.",
    order: 2,
    blocks: [
      {
        type: "text",
        title: "How attackers create pressure",
        body:
          "Phishing messages often manufacture panic: account suspension, missed payroll, legal threat, or failed delivery. The goal is to stop you from verifying the request.",
      },
      {
        type: "question_single",
        title: "Checkpoint",
        body: "A message says your account will be locked in 10 minutes unless you act now. What is the safest response?",
        options: [
          { label: "Pause and verify through the official website or support channel.", isCorrect: true },
          { label: "Click immediately because time is limited.", isCorrect: false },
          { label: "Reply asking the sender for more time.", isCorrect: false },
        ],
      },
      {
        type: "text",
        title: "Red flags in urgent messages",
        body:
          "Look for extreme deadlines, vague consequences, and generic instructions like 'confirm now' or 'secure your account'. Legitimate organizations can send important alerts, but they do not need you to bypass basic verification.",
      },
      {
        type: "question_single",
        title: "Quick decision",
        body: "Which detail most strongly suggests emotional manipulation rather than a normal business request?",
        options: [
          { label: "The message explains the issue and tells you to contact official support.", isCorrect: false },
          { label: "The message threatens immediate punishment unless you click now.", isCorrect: true },
          { label: "The message includes your full name and department.", isCorrect: false },
        ],
      },
      {
        type: "text",
        title: "Takeaway",
        body:
          "Urgency is a tactic, not proof. If a message pushes you to skip verification, treat that pressure itself as a warning sign.",
      },
    ],
  },
  {
    title: "Verify the Real Sender",
    legacyTitles: ["Sender Email Address Tricks"],
    summary: "Check full sender identities, reply-to fields, and domain mismatches before trusting a message.",
    order: 3,
    blocks: [
      {
        type: "text",
        title: "Display names can lie",
        body:
          "Attackers aknow people read names faster than addresses. 'Microsoft Support' or 'CEO Office' means nothing if the real sender domain does not match the organization you expect.",
      },
      {
        type: "question_single",
        title: "Checkpoint",
        body: "Which sender should raise immediate suspicion?",
        options: [
          { label: "IT Helpdesk <helpdesk@company.com>", isCorrect: false },
          { label: "Payroll Team <payroll@company-payroll.com>", isCorrect: true },
          { label: "HR Updates <hr@company.com>", isCorrect: false },
        ],
      },
      {
        type: "text",
        title: "What else to inspect",
        body:
          "Check the full sender address, the reply-to field, and whether the request matches the sender's normal role. A finance request from an HR-branded address is a strong mismatch even if the display name looks clean.",
      },
      {
        type: "question_single",
        title: "Quick decision",
        body: "A message looks like it comes from your CEO, but the reply-to points to a public mailbox. What should you do?",
        options: [
          { label: "Trust the display name and continue the conversation.", isCorrect: false },
          { label: "Verify through another trusted channel before responding.", isCorrect: true },
          { label: "Reply and ask the sender to confirm their identity.", isCorrect: false },
        ],
      },
      {
        type: "text",
        title: "Takeaway",
        body:
          "A familiar name is not enough. Trust is earned by the full sender identity, the request context, and an independent verification step when something feels off.",
      },
    ],
  },
  {
    title: "Handle Attachments Safely",
    legacyTitles: ["Attachments and Downloads"],
    summary: "Recognize risky attachments and follow a safer process before opening files.",
    order: 4,
    blocks: [
      {
        type: "text",
        title: "Why attachments are effective",
        body:
          "Attachments create urgency and curiosity at the same time. An invoice, shared document, or delivery receipt can push users into opening a file before they verify the source.",
      },
      {
        type: "question_single",
        title: "Checkpoint",
        body: "Which attachment deserves the highest caution when it arrives unexpectedly?",
        options: [
          { label: "Monthly-report.pdf", isCorrect: false },
          { label: "invoice-details.docm", isCorrect: true },
          { label: "team-photo.jpg", isCorrect: false },
        ],
      },
      {
        type: "text",
        title: "High-risk file patterns",
        body:
          "Macro-enabled Office files, compressed archives, disk images, and executable files are common delivery methods for malware. Even PDFs can be malicious if the sender or context is wrong, so the rule is still verify first.",
      },
      {
        type: "question_single",
        title: "Quick decision",
        body: "You receive a ZIP file from a vendor you did not expect to hear from. What should you do first?",
        options: [
          { label: "Open it and scan later if something looks wrong.", isCorrect: false },
          { label: "Verify the request with the vendor using a trusted contact method.", isCorrect: true },
          { label: "Forward it to a colleague to see whether it opens safely.", isCorrect: false },
        ],
      },
      {
        type: "text",
        title: "Takeaway",
        body:
          "Unexpected file plus urgency is a dangerous mix. If you did not expect the attachment, stop and verify before downloading or opening anything.",
      },
    ],
  },
  {
    title: "Question Too-Good-To-Be-True Offers",
    legacyTitles: ["Too Good to Be True Offers"],
    summary: "Spot reward, refund, and giveaway scams designed to trigger curiosity and greed.",
    order: 5,
    blocks: [
      {
        type: "text",
        title: "Why reward scams work",
        body:
          "People react quickly to surprise benefits: refunds, bonuses, gift cards, or prize claims. Attackers exploit excitement in the same way they exploit fear.",
      },
      {
        type: "question_single",
        title: "Checkpoint",
        body: "Which message is the strongest sign of a promotional phishing attempt?",
        options: [
          { label: "A newsletter pointing you to the official company portal.", isCorrect: false },
          { label: "A prize claim asking for personal data and immediate action.", isCorrect: true },
          { label: "A receipt for a purchase you actually made yesterday.", isCorrect: false },
        ],
      },
      {
        type: "text",
        title: "Common reward scam signs",
        body:
          "Watch for messages from unknown senders, poor grammar, suspicious links, and requests for credentials or payment to unlock a reward. Legitimate promotions do not need your password to give you a prize.",
      },
      {
        type: "question_single",
        title: "Quick decision",
        body: "What is the safest way to verify an unexpected refund offer?",
        options: [
          { label: "Open the link in the message because it mentions your account.", isCorrect: false },
          { label: "Visit the official website or app directly and check there.", isCorrect: true },
          { label: "Reply to ask the sender whether the reward is real.", isCorrect: false },
        ],
      },
      {
        type: "text",
        title: "Takeaway",
        body:
          "If an offer is unexpected and tries to rush you into sharing data, assume it is unsafe until proven otherwise through an official channel.",
      },
    ],
  },
];

async function ensureSeedStateTable() {
  await execute(`
    CREATE TABLE IF NOT EXISTS _seed_state_ (
      name TEXT PRIMARY KEY,
      version TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);
}

async function getSeedVersion(name: string): Promise<string | null> {
  await ensureSeedStateTable();
  const res = await execute(`SELECT version FROM _seed_state_ WHERE name=? LIMIT 1`, [
    name,
  ]);
  return (res.rows?.[0]?.version as string | undefined) ?? null;
}

async function setSeedVersion(name: string, version: string) {
  await ensureSeedStateTable();
  await execute(
    `
    INSERT INTO _seed_state_ (name, version, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(name) DO UPDATE SET version=excluded.version, updated_at=excluded.updated_at
    `,
    [name, version, Date.now()]
  );
}

function buildLessonContentFromBlocks(blocks: SeedBlock[]): string {
  return blocks
    .filter((block) => block.type === "text")
    .map((block) => `${block.title}\n${block.body}`.trim())
    .join("\n\n");
}

async function findExistingSeedLesson(seedLesson: SeedLesson): Promise<{ id: string } | null> {
  const candidateTitles = [seedLesson.title, ...seedLesson.legacyTitles];
  const placeholders = candidateTitles.map(() => "?").join(", ");
  const byTitle = await execute(
    `SELECT id FROM Lesson WHERE title IN (${placeholders}) ORDER BY "order" ASC LIMIT 1`,
    candidateTitles
  );

  if (byTitle.rows.length > 0) {
    return byTitle.rows[0] as { id: string };
  }

  return null;
}

async function ensureSeedLesson(seedLesson: SeedLesson): Promise<{ id: string }> {
  const content = buildLessonContentFromBlocks(seedLesson.blocks);
  const existing = await findExistingSeedLesson(seedLesson);

  if (existing) {
    await execute(
      `
      UPDATE Lesson
      SET title=?, summary=?, content=?, "order"=?
      WHERE id=?
      `,
      [
        seedLesson.title,
        seedLesson.summary,
        content,
        seedLesson.order,
        existing.id,
      ]
    );
    return existing;
  }

  const id = uuid();
  await execute(
    `
    INSERT INTO Lesson (id, title, summary, content, "order")
    VALUES (?, ?, ?, ?, ?)
    `,
    [id, seedLesson.title, seedLesson.summary, content, seedLesson.order]
  );
  return { id };
}

export async function seedLessons() {
  const currentVersion = await getSeedVersion("lessons");
  if (currentVersion === LESSONS_SEED_VERSION) {
    return;
  }

  for (const lesson of SEED_LESSONS) {
    await ensureSeedLesson(lesson);
  }

  await setSeedVersion("lessons", LESSONS_SEED_VERSION);
}

export async function seedLessonBlocks() {
  const currentVersion = await getSeedVersion("lesson-blocks");
  if (currentVersion === LESSON_BLOCKS_SEED_VERSION) {
    return;
  }

  for (const lesson of SEED_LESSONS) {
    const lessonRow = await ensureSeedLesson(lesson);

    await execute(`DELETE FROM TrainingBlockOption WHERE blockId IN (
      SELECT id FROM TrainingBlock WHERE lessonId=?
    )`, [lessonRow.id]);
    await execute(`DELETE FROM TrainingBlockProgress WHERE lessonId=?`, [lessonRow.id]);
    await execute(`DELETE FROM TrainingBlock WHERE lessonId=?`, [lessonRow.id]);
    await execute(`DELETE FROM LessonProgress WHERE lessonId=?`, [lessonRow.id]);

    let blockOrder = 1;
    for (const block of lesson.blocks) {
      const blockId = uuid();
      await execute(
        `
        INSERT INTO TrainingBlock (id, lessonId, type, title, body, "order", isRequired, pendingSync)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          blockId,
          lessonRow.id,
          block.type,
          block.title,
          block.body,
          blockOrder++,
          block.isRequired === false ? 0 : 1,
          0,
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
            [uuid(), blockId, option.label, option.isCorrect ? 1 : 0, optionOrder++]
          );
        }
      }
    }
  }

  await setSeedVersion("lesson-blocks", LESSON_BLOCKS_SEED_VERSION);
}

async function quizExists(slug: string): Promise<boolean> {
  const r = await execute(`SELECT COUNT(*) as c FROM Quiz WHERE slug=?`, [slug]);
  return (r.rows?.[0]?.c ?? 0) > 0;
}

async function insertClassicQuiz(slug: string, title: string, description: string) {
  const classicId = uuid();
  await execute(
    `INSERT INTO Quiz (id, slug, title, description, kind) VALUES (?, ?, ?, ?, ?)`,
    [classicId, slug, title, description, "classic"]
  );

  // Insert questions & options from QUIZ_QUESTIONS[]
  let qOrder = 1;
  for (const q of QUIZ_QUESTIONS as QuizQuestion[]) {
    const qId = uuid();

    const correctOpt = q.options.find((o) => o.correct);
    const explanation = correctOpt?.explanation ?? null;

    await execute(
      `INSERT INTO Question (id, quizId, text, explanation, "order") VALUES (?, ?, ?, ?, ?)`,
      [qId, classicId, q.text, explanation, qOrder++]
    );

    let oOrder = 1;
    for (const opt of q.options) {
      await execute(
        `INSERT INTO Option (id, questionId, text, isCorrect, "order") VALUES (?, ?, ?, ?, ?)`,
        [uuid(), qId, opt.text, opt.correct ? 1 : 0, oOrder++]
      );
    }
  }
}

export async function seedQuizzes() {
  // --- Classic quizzes (4 total) ---
  const classicSeeds = [
    {
      slug: "classic",
      title: "Classic Quiz - Basics",
      description: "Multiple choice phishing basics",
    },
    {
      slug: "classic-email",
      title: "Classic Quiz - Email Red Flags",
      description: "Practice spotting suspicious email patterns",
    },
    {
      slug: "classic-links",
      title: "Classic Quiz - Links & Domains",
      description: "Train your eye for malicious URLs and fake domains",
    },
    {
      slug: "classic-attachments",
      title: "Classic Quiz - Attachments",
      description: "Learn to handle risky attachments safely",
    },
  ];

  for (const s of classicSeeds) {
    if (!(await quizExists(s.slug))) {
      await insertClassicQuiz(s.slug, s.title, s.description);
    }
  }

  // --- Visual quiz (unchanged) ---
  if (!(await quizExists("visual"))) {
    const visualId = uuid();
    await execute(
      `INSERT INTO Quiz (id, slug, title, description, kind) VALUES (?, ?, ?, ?, ?)`,
      [visualId, "visual", "Visual Quiz", "Swipe phishing vs legit", "visual"]
    );

    const assetKeyById: Record<string, string> = {
      v1: "fake_login",
      v2: "newsletter",
      v3: "password_reset",
      v4: "hr_announcement",
    };

    let vOrder = 1;
    for (const [index, c] of VISUAL_CARDS.entries()) {
      const assetKey = assetKeyById[c.id] ?? `card_${vOrder}`;
      const isPhish = c.label === "PHISHING" ? 1 : 0;
      const variant = getDefaultVisualCardVariantByIndex(index);

      await execute(
        `INSERT INTO VisualCard (id, quizId, asset, label, isPhish, variant, "order") VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [uuid(), visualId, assetKey, c.label, isPhish, variant, vOrder++]
      );
    }
  }
}
