export type VisualCard = {
  id: string;
  image: any; // local image asset
  label: "PHISHING" | "LEGIT";
  explanation: string;
};

export const VISUAL_CARDS: VisualCard[] = [
  {
    id: "v1",
    image: require("../assets/visual/fake_login.png"),
    label: "PHISHING",
    explanation: "It asks you to log in on a fake page that mimics a real website.",
  },
  {
    id: "v2",
    image: require("../assets/visual/newsletter.png"),
    label: "PHISHING",
    explanation: "A normal internal newsletter from a verified company source.",
  },
  {
    id: "v3",
    image: require("../assets/visual/password_reset.png"),
    label: "PHISHING",
    explanation: "Unexpected password reset links are common phishing tactics.",
  },
  {
    id: "v4",
    image: require("../assets/visual/hr_announcement.png"),
    label: "LEGIT",
    explanation: "An HR email with no suspicious links or requests.",
  },
];
