import type { VisualCard } from "./types/models";

export type VisualQuizVariantId =
  | "beginner"
  | "intermediate"
  | "expert"
  | "randomized";

export type VisualQuizEditableVariantId = Exclude<
  VisualQuizVariantId,
  "randomized"
>;

export type VisualQuizVariant = {
  id: VisualQuizVariantId;
  title: string;
  description: string;
};

export const VISUAL_QUIZ_VARIANTS: VisualQuizVariant[] = [
  {
    id: "beginner",
    title: "Beginner",
    description: "Start with the easiest visual phishing examples.",
  },
  {
    id: "intermediate",
    title: "Intermediate",
    description: "A more balanced set with trickier patterns.",
  },
  {
    id: "expert",
    title: "Expert",
    description: "The hardest examples from the current card list.",
  },
  {
    id: "randomized",
    title: "Randomized",
    description: "Play all available cards in a shuffled order.",
  },
];

export const VISUAL_QUIZ_EDITABLE_VARIANTS: VisualQuizEditableVariantId[] = [
  "beginner",
  "intermediate",
  "expert",
];

export function isEditableVisualQuizVariant(
  variantId?: string | null
): variantId is VisualQuizEditableVariantId {
  return VISUAL_QUIZ_EDITABLE_VARIANTS.includes(
    variantId as VisualQuizEditableVariantId
  );
}

export function getDefaultVisualCardVariantByIndex(index: number) {
  if (index < 2) {
    return "beginner" as const;
  }

  if (index === 2) {
    return "intermediate" as const;
  }

  return "expert" as const;
}

export function getAdjacentEditableVariant(
  variantId: VisualQuizEditableVariantId,
  direction: "easier" | "harder"
) {
  const currentIndex = VISUAL_QUIZ_EDITABLE_VARIANTS.indexOf(variantId);
  if (currentIndex < 0) {
    return null;
  }

  const offset = direction === "easier" ? -1 : 1;
  return VISUAL_QUIZ_EDITABLE_VARIANTS[currentIndex + offset] ?? null;
}

function shuffleCards(cards: VisualCard[]) {
  const nextCards = [...cards];

  for (let index = nextCards.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    const currentCard = nextCards[index];
    nextCards[index] = nextCards[swapIndex];
    nextCards[swapIndex] = currentCard;
  }

  return nextCards;
}

export function getVisualQuizVariantById(id?: string | null) {
  return VISUAL_QUIZ_VARIANTS.find((variant) => variant.id === id);
}

export function getVisualCardsForVariant(
  cards: VisualCard[],
  variantId?: string | null,
  options?: { shuffleRandomized?: boolean }
) {
  if (!cards.length) {
    return [];
  }

  if (variantId === "randomized") {
    return options?.shuffleRandomized === false ? [...cards] : shuffleCards(cards);
  }

  const effectiveVariant = isEditableVisualQuizVariant(variantId)
    ? variantId
    : "beginner";

  return cards.filter(
    (card) => (card.variant ?? "beginner") === effectiveVariant
  );
}