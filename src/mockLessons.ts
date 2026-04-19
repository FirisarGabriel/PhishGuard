export type Lesson = {
  id: string;
  title: string;
  summary: string;
  content: string;
};

export const LESSONS: Lesson[] = [
  {
    id: "l1",
    title: "Recognizing Suspicious Links",
    summary: "How to spot look-alike domains & shortened URLs.",
    content:
      "• Hover or long-press links to preview the real URL.\n" +
      "• Watch for misspellings (ex: paypaI.com vs paypal.com).\n" +
      "• Be careful with URL shorteners; expand them before clicking.\n\n" +
      "Tip: If it feels urgent, double-check the sender and the link.",
  },
  {
    id: "l2",
    title: "Sender Impersonation",
    summary: "Display name vs real address. Reply-to tricks.",
    content:
      "• Display names can be faked. Check the full address.\n" +
      "• Compare the sender domain with the company’s real domain.\n" +
      "• Beware of ‘reply-to’ that points to another domain.",
  },
  {
    id: "l3",
    title: "Attachments & Malware",
    summary: "Archive files, macros, and fake invoices.",
    content:
      "• Avoid opening unexpected attachments (ZIP, RAR, ISO).\n" +
      "• Macros can run malware; disable and verify with IT.\n" +
      "• When in doubt, open in a sandboxed viewer or ask support.",
  },
];
