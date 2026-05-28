import type { ImageSourcePropType } from "react-native";

const trainingThumbnailEntries: Array<{
  titles: string[];
  source: ImageSourcePropType;
}> = [
  {
    titles: ["Spot Suspicious Links Before You Tap", "Spotting Suspicious Links"],
    source: require("../assets/training-thumbnails/suspicious_links.png"),
  },
  {
    titles: ["Resist Urgency and Fear Tactics", "Urgency and Fear Tactics"],
    source: require("../assets/training-thumbnails/urgency.png"),
  },
  {
    titles: ["Verify the Real Sender", "Sender Email Address Tricks"],
    source: require("../assets/training-thumbnails/real_sender.png"),
  },
  {
    titles: ["Handle Attachments Safely", "Attachments and Downloads"],
    source: require("../assets/training-thumbnails/attachements.png"),
  },
  {
    titles: [
      "Question Too-Good-To-Be-True Offers",
      "Too Good to Be True Offers",
      "Question Offers That Sound Too Good",
    ],
    source: require("../assets/training-thumbnails/offers_too_good.png"),
  },
];

function normalizeTrainingTitle(title: string) {
  return title.trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function getTrainingThumbnailSource(title: string) {
  const normalizedTitle = normalizeTrainingTitle(title);
  return trainingThumbnailEntries.find((entry) =>
    entry.titles.some(
      (candidateTitle) => normalizeTrainingTitle(candidateTitle) === normalizedTitle
    )
  )?.source;
}