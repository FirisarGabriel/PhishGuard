import { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  View,
  Text,
  Pressable,
  ActivityIndicator,
  FlatList,
  Image,
  Alert,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";

import { theme } from "../../src/theme";
import { useAuth } from "../../src/auth/AuthProvider";
import { useRole } from "../../src/auth/useRole";
import {
  createVisualCard,
  deleteVisualCard,
  getLatestVisualScoresMap,
  getQuizBySlug,
  getVisualCards,
  moveVisualCard,
  startAttempt,
  updateVisualCardVariant,
} from "../../src/repos/quiz";
import type { Quiz, VisualCard } from "../../src/types/models";
import {
  getVisualAssetSource,
  isLocalVisualAsset,
} from "../../src/visualAssets";
import {
  getAdjacentEditableVariant,
  getVisualCardsForVariant,
  isEditableVisualQuizVariant,
  VISUAL_QUIZ_EDITABLE_VARIANTS,
  VISUAL_QUIZ_VARIANTS,
  type VisualQuizEditableVariantId,
  type VisualQuizVariantId,
} from "../../src/visualQuiz";

const ROW_SWAP_OFFSET = 18;

function reorderCards(
  cards: VisualCard[],
  cardId: string,
  direction: "up" | "down"
) {
  const currentIndex = cards.findIndex((card) => card.id === cardId);
  if (currentIndex < 0) {
    return cards;
  }

  const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
  if (targetIndex < 0 || targetIndex >= cards.length) {
    return cards;
  }

  const nextCards = [...cards];
  const [movedCard] = nextCards.splice(currentIndex, 1);
  nextCards.splice(targetIndex, 0, movedCard);
  return nextCards;
}

function getVisualCardVariantIndex(card: VisualCard) {
  return VISUAL_QUIZ_EDITABLE_VARIANTS.indexOf(card.variant ?? "beginner");
}

function sortVisualCards(cards: VisualCard[]) {
  return [...cards].sort((leftCard, rightCard) => {
    const variantDelta =
      getVisualCardVariantIndex(leftCard) - getVisualCardVariantIndex(rightCard);

    if (variantDelta !== 0) {
      return variantDelta;
    }

    return leftCard.order - rightCard.order;
  });
}

function getNextVariantOrder(cards: VisualCard[], variant: VisualQuizEditableVariantId) {
  const matchingCards = cards.filter(
    (card) => (card.variant ?? "beginner") === variant
  );
  const currentMax = Math.max(0, ...matchingCards.map((card) => card.order));
  return currentMax + 1;
}

function reorderCardsWithinVariant(
  cards: VisualCard[],
  cardId: string,
  direction: "up" | "down",
  variant: VisualQuizEditableVariantId
) {
  const variantCards = cards.filter(
    (card) => (card.variant ?? "beginner") === variant
  );
  const currentIndex = variantCards.findIndex((card) => card.id === cardId);
  if (currentIndex < 0) {
    return cards;
  }

  const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
  if (targetIndex < 0 || targetIndex >= variantCards.length) {
    return cards;
  }

  const currentCard = variantCards[currentIndex];
  const targetCard = variantCards[targetIndex];

  return sortVisualCards(
    cards.map((card) => {
      if (card.id === currentCard.id) {
        return { ...card, order: targetCard.order };
      }

      if (card.id === targetCard.id) {
        return { ...card, order: currentCard.order };
      }

      return card;
    })
  );
}

function VisualCardRow({
  item,
  label,
  variantLabel,
  showVariantLabel,
  showLevelActions,
  imageSource,
  canMoveUp,
  canMoveDown,
  controlsDisabled,
  canMakeEasier,
  canMakeHarder,
  moveToken,
  moveOffset,
  isActiveMove,
  onMove,
  onChangeLevel,
  onDelete,
}: {
  item: VisualCard;
  label: string;
  variantLabel: string;
  showVariantLabel: boolean;
  showLevelActions: boolean;
  imageSource: ReturnType<typeof getVisualAssetSource>;
  canMoveUp: boolean;
  canMoveDown: boolean;
  controlsDisabled: boolean;
  canMakeEasier: boolean;
  canMakeHarder: boolean;
  moveToken: number;
  moveOffset: number;
  isActiveMove: boolean;
  onMove: (card: VisualCard, direction: "up" | "down") => void;
  onChangeLevel: (
    card: VisualCard,
    direction: "easier" | "harder"
  ) => void;
  onDelete: (card: VisualCard) => void;
}) {
  const translateY = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!moveOffset) {
      return;
    }

    translateY.setValue(moveOffset);
    scale.setValue(0.988);

    Animated.parallel([
      Animated.spring(translateY, {
        toValue: 0,
        useNativeDriver: true,
        tension: 125,
        friction: 12,
      }),
      Animated.spring(scale, {
        toValue: 1,
        useNativeDriver: true,
        tension: 130,
        friction: 11,
      }),
    ]).start();
  }, [moveOffset, moveToken, scale, translateY]);

  return (
    <Animated.View
      style={{
        transform: [{ translateY }, { scale }],
      }}
    >
      <View
        style={{
          borderWidth: 1,
          borderColor: isActiveMove ? theme.colors.text : theme.colors.border,
          borderRadius: theme.radius,
          padding: 12,
          backgroundColor: theme.colors.card,
          flexDirection: "row",
          gap: 12,
          alignItems: "center",
        }}
      >
        <View
          style={{
            width: 72,
            height: 72,
            borderRadius: 10,
            overflow: "hidden",
            borderWidth: 1,
            borderColor: theme.colors.border,
            backgroundColor: theme.colors.card,
          }}
        >
          <Image
            source={imageSource}
            style={{ width: "100%", height: "100%" }}
            resizeMode="cover"
          />
        </View>

        <View style={{ flex: 1 }}>
          <Text style={{ fontWeight: "800", fontSize: 15 }} numberOfLines={1}>
            {item.asset.split("/").pop() ?? item.asset}
          </Text>

          <View
            style={{
              height: 1,
              backgroundColor: theme.colors.border,
              marginVertical: 8,
            }}
          />

          <Text
            style={{
              color: theme.colors.text,
              fontWeight: "600",
            }}
          >
            {label}
          </Text>

          {showVariantLabel ? (
            <Text style={{ color: theme.colors.muted, marginTop: 6 }}>
              Level: {variantLabel}
            </Text>
          ) : null}

          {showLevelActions && (
            <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
              <Pressable
                onPress={() => onChangeLevel(item, "easier")}
                disabled={controlsDisabled || !canMakeEasier}
                style={({ pressed }) => ({
                  opacity:
                    pressed || controlsDisabled || !canMakeEasier ? 0.38 : 1,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                  borderRadius: 999,
                  paddingVertical: 6,
                  paddingHorizontal: 10,
                  backgroundColor: theme.colors.card,
                })}
              >
                <Text style={{ fontSize: 12, fontWeight: "600" }}>Easier</Text>
              </Pressable>

              <Pressable
                onPress={() => onChangeLevel(item, "harder")}
                disabled={controlsDisabled || !canMakeHarder}
                style={({ pressed }) => ({
                  opacity:
                    pressed || controlsDisabled || !canMakeHarder ? 0.38 : 1,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                  borderRadius: 999,
                  paddingVertical: 6,
                  paddingHorizontal: 10,
                  backgroundColor: theme.colors.card,
                })}
              >
                <Text style={{ fontSize: 12, fontWeight: "600" }}>Harder</Text>
              </Pressable>
            </View>
          )}
        </View>

        <View style={{ gap: 8 }}>
          <Pressable
            onPress={() => onMove(item, "up")}
            disabled={!canMoveUp || controlsDisabled}
            hitSlop={10}
            style={({ pressed }) => ({
              opacity: pressed || !canMoveUp || controlsDisabled ? 0.45 : 1,
              padding: 8,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: theme.colors.border,
              backgroundColor: theme.colors.card,
            })}
          >
            <Ionicons name="chevron-up" size={18} />
          </Pressable>

          <Pressable
            onPress={() => onMove(item, "down")}
            disabled={!canMoveDown || controlsDisabled}
            hitSlop={10}
            style={({ pressed }) => ({
              opacity: pressed || !canMoveDown || controlsDisabled ? 0.45 : 1,
              padding: 8,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: theme.colors.border,
              backgroundColor: theme.colors.card,
            })}
          >
            <Ionicons name="chevron-down" size={18} />
          </Pressable>
        </View>

        <Pressable
          onPress={() => onDelete(item)}
          disabled={controlsDisabled}
          hitSlop={10}
          style={({ pressed }) => ({
            opacity: pressed || controlsDisabled ? 0.7 : 1,
            padding: 8,
            borderRadius: 999,
            borderWidth: 1,
            borderColor: theme.colors.border,
            backgroundColor: theme.colors.card,
          })}
        >
          <Ionicons name="trash" size={18} />
        </Pressable>
      </View>
    </Animated.View>
  );
}

export default function VisualQuizIntro() {
  const router = useRouter();

  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [cards, setCards] = useState<VisualCard[]>([]);
  const [latestScores, setLatestScores] = useState<
    Partial<Record<VisualQuizVariantId, number>>
  >({});
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [startingVariant, setStartingVariant] = useState<VisualQuizVariantId | null>(null);
  const [selectedAdminVariant, setSelectedAdminVariant] =
    useState<VisualQuizVariantId>("beginner");
  const [uploading, setUploading] = useState(false);
  const [movingState, setMovingState] = useState<{
    cardId: string;
    direction: "up" | "down";
  } | null>(null);
  const [movementToken, setMovementToken] = useState(0);
  const [movementState, setMovementState] = useState<{
    movedCardId: string;
    swappedCardId: string;
    direction: "up" | "down";
  } | null>(null);

  const { user, adminMode } = useAuth();
  const { role } = useRole();

  const userId = user?.id;
  const isAdminUi = role === "ADMIN" && adminMode;

  const load = useCallback(async (options?: { showLoader?: boolean }) => {
    if (!userId) {
      setErr("Not signed in.");
      setLatestScores({});
      setLoading(false);
      return;
    }

    const shouldShowLoader = options?.showLoader ?? true;

    try {
      setErr(null);
      if (shouldShowLoader) {
        setLoading(true);
      }

      const q = await getQuizBySlug("visual");
      if (!q) throw new Error("Visual quiz not found.");
      setQuiz(q);

      const visualCards = await getVisualCards(q.id);
      setCards(visualCards);

      const scoreMap = await getLatestVisualScoresMap(userId, q.id);
      setLatestScores(scoreMap);
    } catch (e: any) {
      setErr(e?.message ?? "Failed to load quiz.");
    } finally {
      if (shouldShowLoader) {
        setLoading(false);
      }
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      void load({ showLoader: false });
    }, [load])
  );

  const onStart = async (variantId: VisualQuizVariantId) => {
    if (!quiz || !userId) return;

    try {
      setStartingVariant(variantId);
      const attemptId = await startAttempt(userId, quiz.id, {
        variant: variantId,
      });
      router.push({
        pathname: "/visual-quiz/card",
        params: {
          quizId: quiz.id,
          attemptId,
          index: "0",
          score: "0",
          variant: variantId,
        },
      });
    } catch (e: any) {
      setErr(e?.message ?? "Failed to start quiz.");
    } finally {
      setStartingVariant(null);
    }
  };

  const savePickedImageAsCard = useCallback(
    async (pickedUri: string, isPhish: boolean) => {
      if (!quiz || !isEditableVisualQuizVariant(selectedAdminVariant)) return;

      try {
        setUploading(true);

        const baseDir = FileSystem.documentDirectory;
        if (!baseDir) {
          throw new Error("Local storage is not available on this device.");
        }

        const folder = `${baseDir}visual-cards/`;
        await FileSystem.makeDirectoryAsync(folder, { intermediates: true });

        const cleanUri = pickedUri.split("?")[0];
        const ext = cleanUri.includes(".")
          ? cleanUri.substring(cleanUri.lastIndexOf("."))
          : ".jpg";

        const destination = `${folder}${Date.now()}${ext}`;

        await FileSystem.copyAsync({
          from: pickedUri,
          to: destination,
        });

        await createVisualCard({
          quizId: quiz.id,
          asset: destination,
          label: isPhish ? "PHISHING" : "LEGIT",
          isPhish,
          variant: selectedAdminVariant,
        });

        await load({ showLoader: false });
      } catch (e: any) {
        Alert.alert("Upload failed", e?.message ?? "Could not save image.");
      } finally {
        setUploading(false);
      }
    },
    [load, quiz, selectedAdminVariant]
  );

  const onAdd = useCallback(async () => {
    if (!quiz || !isEditableVisualQuizVariant(selectedAdminVariant)) return;

    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(
          "Permission required",
          "Photo library permission is needed to upload an image."
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 1,
        allowsEditing: false,
      });

      if (result.canceled || !result.assets?.length) {
        return;
      }

      const picked = result.assets[0];

      Alert.alert(
        "Select label",
        "How should this image be classified?",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "LEGIT",
            onPress: () => {
              void savePickedImageAsCard(picked.uri, false);
            },
          },
          {
            text: "PHISHING",
            onPress: () => {
              void savePickedImageAsCard(picked.uri, true);
            },
          },
        ]
      );
    } catch (e: any) {
      Alert.alert("Image picker failed", e?.message ?? "Could not open gallery.");
    }
  }, [quiz, savePickedImageAsCard, selectedAdminVariant]);

  const onDelete = useCallback(
    (card: VisualCard) => {
      Alert.alert(
        "Delete visual card?",
        `This will permanently delete "${card.asset}".`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete",
            style: "destructive",
            onPress: async () => {
              try {
                if (isLocalVisualAsset(card.asset)) {
                  await FileSystem.deleteAsync(card.asset, { idempotent: true });
                }
                await deleteVisualCard(card.id);
                setCards((currentCards) =>
                  currentCards.filter((currentCard) => currentCard.id !== card.id)
                );
              } catch (e: any) {
                await load({ showLoader: false });
                Alert.alert(
                  "Delete failed",
                  e?.message ?? "Could not delete visual card."
                );
              }
            },
          },
        ]
      );
    },
    [load]
  );

  const onMove = useCallback(
    async (card: VisualCard, direction: "up" | "down") => {
      if (!quiz) return;

      const variant = card.variant ?? "beginner";

      const variantCards = cards.filter(
        (currentCard) => (currentCard.variant ?? "beginner") === variant
      );
      const currentIndex = variantCards.findIndex(
        (currentCard) => currentCard.id === card.id
      );
      if (currentIndex < 0) {
        return;
      }

      const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
      if (targetIndex < 0 || targetIndex >= variantCards.length) {
        return;
      }

      const swappedCard = variantCards[targetIndex];

      const nextCards = reorderCardsWithinVariant(cards, card.id, direction, variant);
      if (nextCards === cards) {
        return;
      }

      try {
        setMovingState({ cardId: card.id, direction });
        setMovementToken((currentToken) => currentToken + 1);
        setMovementState({
          movedCardId: card.id,
          swappedCardId: swappedCard.id,
          direction,
        });
        setCards(nextCards);
        await moveVisualCard(quiz.id, card.id, direction, variant);
      } catch (e: any) {
        setMovementState(null);
        await load({ showLoader: false });
        Alert.alert(
          "Reorder failed",
          e?.message ?? "Could not reorder visual card."
        );
      } finally {
        setMovingState(null);
      }
    },
    [cards, load, quiz]
  );

  const onChangeLevel = useCallback(
    async (card: VisualCard, direction: "easier" | "harder") => {
      const currentVariant = card.variant ?? "beginner";
      const targetVariant = getAdjacentEditableVariant(currentVariant, direction);
      if (!targetVariant) {
        return;
      }

      try {
        const nextOrder = getNextVariantOrder(cards, targetVariant);
        setCards((currentCards) =>
          sortVisualCards(
            currentCards.map((currentCard) =>
              currentCard.id === card.id
                ? {
                    ...currentCard,
                    variant: targetVariant,
                    order: nextOrder,
                  }
                : currentCard
            )
          )
        );
        await updateVisualCardVariant(card.id, targetVariant);
      } catch (e: any) {
        await load({ showLoader: false });
        Alert.alert(
          "Level update failed",
          e?.message ?? "Could not move this card to another level."
        );
      }
    },
    [cards, load]
  );

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator />
      </View>
    );
  }

  if (err || !quiz) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
          backgroundColor: theme.colors.bg,
        }}
      >
        <Text style={{ fontSize: 18, fontWeight: "700", marginBottom: 8 }}>
          Visual Quiz
        </Text>
        <Text style={{ color: theme.colors.muted, textAlign: "center" }}>
          {err ?? "Unknown error"}
        </Text>
      </View>
    );
  }

  if (!isAdminUi) {
    const availableVariants = VISUAL_QUIZ_VARIANTS.map((variant) => ({
      ...variant,
      cards: getVisualCardsForVariant(cards, variant.id, {
        shuffleRandomized: false,
      }),
    }));

    return (
      <View
        style={{
          flex: 1,
          padding: 24,
          backgroundColor: theme.colors.bg,
        }}
      >
        <Text style={{ fontSize: 26, fontWeight: "700", marginBottom: 8 }}>
          {quiz.title}
        </Text>
        <Text
          style={{
            color: theme.colors.muted,
            marginBottom: 24,
          }}
        >
          {quiz.description ??
            "Swipe through real-world examples and decide if they're phishing or legitimate."}
        </Text>

        <FlatList
          data={availableVariants}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingVertical: 8, gap: 12 }}
          renderItem={({ item }) => {
            const disabled = !item.cards.length || startingVariant !== null;
            const isStarting = startingVariant === item.id;

            return (
              <Pressable
                onPress={() => void onStart(item.id)}
                disabled={disabled}
                style={({ pressed }) => ({
                  opacity: pressed || disabled ? 0.72 : 1,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                  borderRadius: theme.radius,
                  padding: 16,
                  backgroundColor: theme.colors.card,
                  gap: 6,
                })}
                accessibilityLabel={`Start ${item.title} visual quiz`}
              >
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 12,
                  }}
                >
                  <Text style={{ fontSize: 18, fontWeight: "700" }}>
                    {item.title}
                  </Text>
                  {isStarting ? (
                    <ActivityIndicator />
                  ) : (
                    <Text style={{ color: theme.colors.muted, fontWeight: "600" }}>
                      {item.cards.length} cards
                    </Text>
                  )}
                </View>

                <Text style={{ color: theme.colors.muted }}>
                  {item.description}
                </Text>

                <Text style={{ color: theme.colors.text, fontWeight: "600" }}>
                  {latestScores[item.id] !== undefined
                    ? `Last score: ${latestScores[item.id]}/${item.cards.length}`
                    : "Last score: no attempts yet"}
                </Text>
              </Pressable>
            );
          }}
          ListFooterComponent={
            <Text style={{ color: theme.colors.muted, marginTop: 8 }}>
              Beginner, Intermediate and Expert use their own managed image lists. Randomized always includes every image from those three levels in shuffled order.
            </Text>
          }
        />
      </View>
    );
  }

  const adminCards = getVisualCardsForVariant(cards, selectedAdminVariant, {
    shuffleRandomized: false,
  });
  const isRandomizedAdminView = selectedAdminVariant === "randomized";
  const adminTabItems = VISUAL_QUIZ_VARIANTS.map((variant) => ({
    ...variant,
    cards: getVisualCardsForVariant(cards, variant.id, {
      shuffleRandomized: false,
    }),
  }));

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.bg, padding: 16 }}>
      <Text style={{ fontSize: 24, fontWeight: "700" }}>Visual Cards</Text>
      <Text style={{ color: theme.colors.muted, marginTop: 4 }}>
        Admin Mode is ON — manage the visual quiz cards.
      </Text>
      <Text style={{ color: theme.colors.muted, marginTop: 6 }}>
        Beginner, Intermediate and Expert are editable. Randomized always reflects every image from those levels.
      </Text>

      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          justifyContent: "space-between",
          gap: 10,
          marginTop: 14,
          marginBottom: 4,
        }}
      >
        {adminTabItems.map((item) => {
          const isSelected = selectedAdminVariant === item.id;

          return (
            <Pressable
              key={item.id}
              onPress={() => setSelectedAdminVariant(item.id)}
              style={({ pressed }) => ({
                width: "48%",
                minHeight: 82,
                opacity: pressed ? 0.88 : 1,
                borderWidth: 1,
                borderColor: isSelected ? theme.colors.text : theme.colors.border,
                borderRadius: 16,
                paddingVertical: 12,
                paddingHorizontal: 14,
                backgroundColor: theme.colors.card,
                justifyContent: "space-between",
                shadowColor: theme.colors.shadow,
                shadowOpacity: isSelected ? 0.06 : 0.03,
                shadowRadius: 6,
                shadowOffset: { width: 0, height: 3 },
                elevation: isSelected ? 2 : 1,
              })}
            >
              <Text style={{ fontWeight: "700", fontSize: 15 }}>{item.title}</Text>
              <Text style={{ color: theme.colors.muted, fontSize: 12 }}>
                {item.cards.length} cards
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View
        style={{
          flexDirection: "row",
          justifyContent: "flex-end",
          marginTop: 12,
          marginBottom: 4,
        }}
      >
        <Pressable
          onPress={onAdd}
          disabled={uploading || isRandomizedAdminView}
          style={({ pressed }) => ({
            opacity: pressed || uploading || isRandomizedAdminView ? 0.55 : 1,
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            borderWidth: 1,
            borderColor: theme.colors.border,
            borderRadius: theme.radius,
            paddingVertical: 10,
            paddingHorizontal: 12,
            backgroundColor: theme.colors.card,
          })}
        >
          {uploading ? (
            <ActivityIndicator />
          ) : (
            <>
              <Ionicons name="add" size={18} />
              <Text style={{ fontWeight: "700" }}>
                {isRandomizedAdminView ? "Randomized is auto-built" : "Add image"}
              </Text>
            </>
          )}
        </Pressable>
      </View>

      <Text style={{ color: theme.colors.muted, marginBottom: 8 }}>
        {isRandomizedAdminView
          ? "Randomized is read-only here and includes all cards from the editable levels."
          : `You're editing the ${selectedAdminVariant} level.`}
      </Text>

      <FlatList
        data={adminCards}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingVertical: 12 }}
        ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
        renderItem={({ item, index }) => {
          const imageSource = getVisualAssetSource(item.asset);
          const label = item.isPhish ? "PHISHING" : "LEGIT";
          const isMoving = movingState?.cardId === item.id;
          const currentVariant = item.variant ?? "beginner";
          const canMoveUp = !isRandomizedAdminView && index > 0 && !isMoving;
          const canMoveDown =
            !isRandomizedAdminView && index < adminCards.length - 1 && !isMoving;
          const moveOffset = movementState
            ? movementState.movedCardId === item.id
              ? movementState.direction === "up"
                ? ROW_SWAP_OFFSET
                : -ROW_SWAP_OFFSET
              : movementState.swappedCardId === item.id
              ? movementState.direction === "up"
                ? -ROW_SWAP_OFFSET
                : ROW_SWAP_OFFSET
              : 0
            : 0;

          return (
            <VisualCardRow
              item={item}
              label={label}
              variantLabel={
                VISUAL_QUIZ_VARIANTS.find((variant) => variant.id === currentVariant)
                  ?.title ?? "Beginner"
              }
              showVariantLabel={isRandomizedAdminView}
              showLevelActions={!isRandomizedAdminView}
              imageSource={imageSource}
              canMoveUp={canMoveUp}
              canMoveDown={canMoveDown}
              controlsDisabled={movingState !== null || isRandomizedAdminView}
              canMakeEasier={
                !isRandomizedAdminView &&
                getAdjacentEditableVariant(currentVariant, "easier") !== null
              }
              canMakeHarder={
                !isRandomizedAdminView &&
                getAdjacentEditableVariant(currentVariant, "harder") !== null
              }
              moveToken={moveOffset ? movementToken : 0}
              moveOffset={moveOffset}
              isActiveMove={isMoving}
              onMove={onMove}
              onChangeLevel={onChangeLevel}
              onDelete={onDelete}
            />
          );
        }}
        ListEmptyComponent={
          <View style={{ alignItems: "center", marginTop: 40 }}>
            <Text style={{ color: theme.colors.muted }}>
              {isRandomizedAdminView
                ? "No visual cards available yet."
                : `No cards found in ${selectedAdminVariant}.`}
            </Text>
          </View>
        }
      />
    </View>
  );
}

