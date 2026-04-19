import { execute } from "./index";
import "react-native-get-random-values";
import { v4 as uuid } from "uuid";

import { QUIZ_QUESTIONS, type QuizQuestion } from "../mockClassicQuiz";
import { VISUAL_CARDS } from "../mockVisualQuiz";
import { getDefaultVisualCardVariantByIndex } from "../visualQuiz";

export async function seedLessons() {
  const count = await execute(`SELECT COUNT(*) as c FROM Lesson`);
  if ((count.rows[0]?.c ?? 0) > 0) return;

  const lessons = [
    {
      title: "Spotting Suspicious Links",
      summary: "How to identify malicious links before clicking.",
      order: 1,
      content: `
  Phishing attacks often rely on malicious links to steal your credentials.

  Before clicking any link, it is important to slow down and examine it carefully.

  WHAT TO CHECK FIRST
  - Hover over the link to preview the real destination.
  - Look for misspellings or extra characters in the domain.
  - Be cautious with shortened URLs.

  COMMON RED FLAGS
  - Links that use IP addresses instead of domain names.
  - Unexpected links in emails claiming urgency.
  - Slight variations of well-known domains.

  EXAMPLE
  A legitimate link:
  https://paypal.com/login

  A phishing link:
  https://paypaI.com.verify-login.ru

  Notice the subtle differences.

  BEST PRACTICES
  - Type important websites manually in the browser.
  - Use bookmarks for frequently visited services.
  - When in doubt, do not click.

  TAKEAWAY
  If a link looks even slightly suspicious, do not trust it.
  `,
    },
    {
      title: "Urgency and Fear Tactics",
      summary: "Why attackers use pressure and emotional triggers.",
      order: 2,
      content: `
  Phishers often create a sense of urgency to make you act without thinking.

  Messages may claim that your account is at risk or that immediate action is required.

  COMMON URGENCY PHRASES
  - "Your account will be suspended."
  - "Immediate action required."
  - "Last warning."

  WHY THIS WORKS
  - Stress reduces critical thinking.
  - Fear pushes users to act quickly.
  - Authority messages increase compliance.

  HOW TO RESPOND
  - Pause and take a moment.
  - Ask yourself if the message makes sense.
  - Verify the information through official channels.

  RED FLAGS
  - Deadlines that are extremely short.
  - Threats without clear explanation.
  - Requests for sensitive information.

  TAKEAWAY
  Urgency is a powerful manipulation tool. Slow down before acting.
  `,
    },
    {
      title: "Sender Email Address Tricks",
      summary: "How attackers disguise sender identities.",
      order: 3,
      content: `
  Attackers often spoof email addresses to look legitimate.

  At first glance, the sender name may appear trustworthy.

  WHAT TO CHECK
  - Look at the full email address, not just the display name.
  - Watch for extra characters or domains.
  - Check if the domain matches the company website.

  COMMON EXAMPLES
  support@paypaI.com
  security@amazon-support.co

  These addresses look real but are not.

  WHY IT FOOLS USERS
  - Most people only read the display name.
  - Small differences are easy to miss.

  BEST PRACTICES
  - Always inspect the full sender address.
  - Be cautious with unexpected emails.
  - Contact the company through official channels.

  TAKEAWAY
  A familiar name does not guarantee a legitimate sender.
  `,
    },
    {
      title: "Attachments and Downloads",
      summary: "Why unexpected files are dangerous.",
      order: 4,
      content: `
  Phishing emails often include malicious attachments.

  These files may contain malware or ransomware.

  COMMON ATTACHMENT TYPES
  - ZIP files
  - PDF invoices
  - Word documents with macros

  RED FLAGS
  - Unexpected attachments.
  - Messages urging you to open files quickly.
  - Files requiring you to enable macros.

  SAFE HANDLING
  - Do not open unexpected attachments.
  - Verify the sender before downloading.
  - Use antivirus software.

  WHY THIS IS DANGEROUS
  - Malware can steal data.
  - Ransomware can lock your system.
  - Infections can spread inside organizations.

  TAKEAWAY
  If you did not expect a file, do not open it.
  `,
    },
    {
      title: "Too Good to Be True Offers",
      summary: "Recognizing scam promotions and fake rewards.",
      order: 5,
      content: `
  Phishing messages often promise rewards that seem too good to be true.

  Examples include prizes, refunds, or free gifts.

  COMMON SCAM THEMES
  - You have won a prize.
  - Unexpected refunds.
  - Exclusive limited-time offers.

  WHY IT WORKS
  - Curiosity drives clicks.
  - Greed overrides caution.
  - Excitement reduces skepticism.

  RED FLAGS
  - Requests for personal data to claim rewards.
  - Messages from unknown senders.
  - Poor grammar or formatting.

  HOW TO STAY SAFE
  - Ignore unsolicited offers.
  - Verify promotions on official websites.
  - Remember: legitimate companies do not ask for sensitive data via email.

  TAKEAWAY
  If it sounds too good to be true, it probably is.
  `,
    },
  ];

  for (const l of lessons) {
    await execute(
      `INSERT INTO Lesson (id, title, summary, content, "order")
       VALUES (?, ?, ?, ?, ?)`,
      [uuid(), l.title, l.summary, l.content.trim(), l.order]
    );
  }
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
