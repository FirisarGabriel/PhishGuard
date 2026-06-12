import type { ImageSourcePropType } from "react-native";

export const TRAINING_BLOCK_IMAGE_EXAMPLES: Array<{
  key: string;
  label: string;
  source: ImageSourcePropType;
}> = [
  {
    key: "training/suspicious_links",
    label: "Suspicious links",
    source: require("../assets/training-thumbnails/suspicious_links.png"),
  },
  {
    key: "training/urgency",
    label: "Urgency tactics",
    source: require("../assets/training-thumbnails/urgency.png"),
  },
  {
    key: "training/real_sender",
    label: "Real sender",
    source: require("../assets/training-thumbnails/real_sender.png"),
  },
  {
    key: "training/attachments",
    label: "Attachments",
    source: require("../assets/training-thumbnails/attachements.png"),
  },
  {
    key: "training/offers_too_good",
    label: "Fake offers",
    source: require("../assets/training-thumbnails/offers_too_good.png"),
  },
  {
    key: "visual/fake_login",
    label: "Fake login",
    source: require("../assets/visual/fake_login.png"),
  },
  {
    key: "visual/password_reset",
    label: "Password reset",
    source: require("../assets/visual/password_reset.png"),
  },
  {
    key: "visual/newsletter",
    label: "Newsletter",
    source: require("../assets/visual/newsletter.png"),
  },
  {
    key: "visual/hr_announcement",
    label: "HR announcement",
    source: require("../assets/visual/hr_announcement.png"),
  },
];

const imageExamplesByKey = new Map(
  TRAINING_BLOCK_IMAGE_EXAMPLES.map((example) => [example.key, example.source])
);

export function getTrainingBlockImageSource(
  value?: string | null
): ImageSourcePropType | null {
  const source = value?.trim();
  if (!source) return null;

  const builtInSource = imageExamplesByKey.get(source);
  if (builtInSource) return builtInSource;

  if (/^(https?:|file:|data:image\/)/i.test(source)) {
    return { uri: source };
  }

  return null;
}
