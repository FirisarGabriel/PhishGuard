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
