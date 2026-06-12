export type QuizQuestion = {
  id: string;
  text: string;
  options: { id: string; text: string; correct: boolean; explanation: string }[];
};

export const QUIZ_QUESTIONS: QuizQuestion[] = [
  {
    id: "q1",
    text: "The email says 'Your account will be suspended in 24h' and includes a link. What should you do?",
    options: [
      { id: "o1", text: "Click the link immediately", correct: false, explanation: "Phishing often uses urgency to trick you." },
      { id: "o2", text: "Ignore it and report to IT", correct: true, explanation: "That's the safest response." },
      { id: "o3", text: "Reply asking if it’s legit", correct: false, explanation: "Never reply to suspicious senders." },
    ],
  },
  {
    id: "q2",
    text: "The sender’s domain is 'support-paypal.net'. What should you notice?",
    options: [
      { id: "o1", text: "It’s fine — has 'paypal' in it", correct: false, explanation: "Fake domains often contain the brand name." },
      { id: "o2", text: "The domain isn’t official", correct: true, explanation: "Real PayPal is paypal.com, not paypal.net." },
      { id: "o3", text: "Reply to confirm sender identity", correct: false, explanation: "Never reply to confirm suspicious senders." },
    ],
  },
  {
    id: "q3",
    text: "The email attachment is 'invoice.zip'. Should you open it?",
    options: [
      { id: "o1", text: "Yes, zip files are safe", correct: false, explanation: "ZIP attachments are often used for malware." },
      { id: "o2", text: "No, ask IT first", correct: true, explanation: "Always verify unexpected attachments." },
    ],
  },
];

const BASICS_EXTRA_QUESTIONS: QuizQuestion[] = [
  {
    id: "q-basics-4",
    text: "You receive a login alert from a service you use, but you did not try to sign in. What is the safest next step?",
    options: [
      { id: "o1", text: "Click the email link and log in to check", correct: false, explanation: "A phishing email can send you to a fake login page." },
      { id: "o2", text: "Open the service from a trusted bookmark or app and review account activity", correct: true, explanation: "Using a trusted path avoids fake links while still letting you verify the alert." },
      { id: "o3", text: "Forward the email to coworkers to ask what they think", correct: false, explanation: "Forwarding suspicious messages can spread the risk." },
    ],
  },
  {
    id: "q-basics-5",
    text: "A message asks for your password so support can fix your account. What should you do?",
    options: [
      { id: "o1", text: "Share it only if the sender looks official", correct: false, explanation: "Attackers often make messages look official." },
      { id: "o2", text: "Refuse and report it, because support should never need your password", correct: true, explanation: "Legitimate support teams should not ask for your password." },
      { id: "o3", text: "Send a screenshot from your password manager", correct: false, explanation: "Screenshots can expose sensitive account details." },
    ],
  },
];

const EMAIL_RED_FLAGS_EXTRA_QUESTIONS: QuizQuestion[] = [
  {
    id: "q-email-4",
    text: "Which greeting is a warning sign in an email that claims to be from your bank?",
    options: [
      { id: "o1", text: "Dear customer, with no account-specific detail", correct: true, explanation: "Generic greetings can indicate a mass phishing message." },
      { id: "o2", text: "Your full name and a normal service notification", correct: false, explanation: "Personalized details are not proof by themselves, but they are less suspicious than a generic greeting." },
      { id: "o3", text: "A monthly statement notice you expected", correct: false, explanation: "Expected routine messages are lower risk, though links should still be checked." },
    ],
  },
  {
    id: "q-email-5",
    text: "Which sender address is most suspicious for a Microsoft password reset email?",
    options: [
      { id: "o1", text: "no-reply@account.microsoft.com", correct: false, explanation: "This uses the microsoft.com domain." },
      { id: "o2", text: "security@microsoft-login-help.com", correct: true, explanation: "The real domain is microsoft-login-help.com, not microsoft.com." },
      { id: "o3", text: "account-security-noreply@accountprotection.microsoft.com", correct: false, explanation: "This still belongs to a microsoft.com subdomain." },
    ],
  },
];

export const CLASSIC_QUIZ_QUESTIONS_BY_SLUG: Record<string, QuizQuestion[]> = {
  classic: [...QUIZ_QUESTIONS, ...BASICS_EXTRA_QUESTIONS],
  "classic-email": [...QUIZ_QUESTIONS, ...EMAIL_RED_FLAGS_EXTRA_QUESTIONS],
};
