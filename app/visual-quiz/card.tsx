import { useRef, useState, useEffect } from "react";
import {
  View,
  Text,
  Image,
  Pressable,
  ActivityIndicator,
  Animated,
  PanResponder,
  Dimensions,
  Modal,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { theme } from "../../src/theme";
import { getVisualCards } from "../../src/repos/quiz";
import type { VisualCard } from "../../src/types/models";
import { getVisualAssetSource } from "../../src/visualAssets";
import {
  getVisualCardsForVariant,
  getVisualQuizVariantById,
} from "../../src/visualQuiz";

const { width: SCREEN_W } = Dimensions.get("window");
const SWIPE_THRESHOLD = SCREEN_W * 0.22; // how far to swipe to trigger
const CARD_CONFIRM_OFFSET = SCREEN_W * 0.08;
const CARD_ENTRY_OFFSET = SCREEN_W * 0.12;
const CARD_EXIT_OFFSET = SCREEN_W * 1.05;

export default function VisualQuizCard() {
  const router = useRouter();
  const {
    quizId,
    attemptId,
    index: startIndex,
    score: startScore,
    variant,
  } = useLocalSearchParams<{
    quizId: string;
    attemptId: string;
    index?: string;
    score?: string;
    variant?: string;
  }>();

  const [cards, setCards] = useState<VisualCard[]>([]);
  const [index, setIndex] = useState<number>(Number(startIndex ?? 0));
  const [answered, setAnswered] = useState(false);
  const [selected, setSelected] = useState<"PHISHING" | "LEGIT" | null>(null);
  const [score, setScore] = useState<number>(Number(startScore ?? 0));
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [popup, setPopup] = useState<{ visible: boolean; correct: boolean } | null>(null);

  // keep latest score in a ref so we can navigate with the correct value
  const scoreRef = useRef<number>(Number(startScore ?? 0));
  const pendingEntryDirectionRef = useRef<-1 | 0 | 1>(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    scoreRef.current = score;
  }, [score]);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  // --- animated swipe state ---
  const translateX = useRef(new Animated.Value(0)).current;
  const cardOpacity = useRef(new Animated.Value(1)).current;
  const cardScale = useRef(new Animated.Value(1)).current;
  const rotate = translateX.interpolate({
    inputRange: [-SCREEN_W, 0, SCREEN_W],
    outputRange: ["-10deg", "0deg", "10deg"],
  });
  const likeOpacity = translateX.interpolate({
    inputRange: [0, SCREEN_W * 0.5],
    outputRange: [0, 1],
    extrapolate: "clamp",
  });
  const nopeOpacity = translateX.interpolate({
    inputRange: [-SCREEN_W * 0.5, 0],
    outputRange: [1, 0],
    extrapolate: "clamp",
  });

  // Load cards from SQLite
  useEffect(() => {
    (async () => {
      try {
        setErr(null);
        setLoading(true);
        const rows = await getVisualCards(String(quizId));
        const selectedCards = getVisualCardsForVariant(rows, variant);
        if (!selectedCards.length) throw new Error("No cards found.");
        setCards(selectedCards);
      } catch (e: any) {
        setErr(e?.message ?? "Failed to load visual quiz.");
      } finally {
        setLoading(false);
      }
    })();
  }, [quizId, variant]);

  const card = cards[index];
  const total = cards.length;
  const isLast = index === total - 1;

  useEffect(() => {
    if (loading || !card) return;

    const entryDirection = pendingEntryDirectionRef.current;
    translateX.setValue(entryDirection * CARD_ENTRY_OFFSET);
    cardOpacity.setValue(0);
    cardScale.setValue(0.985);

    Animated.parallel([
      Animated.spring(translateX, {
        toValue: 0,
        useNativeDriver: true,
        tension: 70,
        friction: 9,
      }),
      Animated.timing(cardOpacity, {
        toValue: 1,
        duration: 180,
        useNativeDriver: true,
      }),
      Animated.spring(cardScale, {
        toValue: 1,
        useNativeDriver: true,
        tension: 80,
        friction: 10,
      }),
    ]).start(() => {
      pendingEntryDirectionRef.current = 0;
    });
  }, [card, cardOpacity, cardScale, loading, translateX]);

  const handleChoose = (answer: "PHISHING" | "LEGIT") => {
    if (answered || !card) return;

    setSelected(answer);
    setAnswered(true);

    const isPhish = card.isPhish === 1;
    const correct =
      (answer === "PHISHING" && isPhish) || (answer === "LEGIT" && !isPhish);

    // compute next score immediately, so navigation uses correct value
    const newScore = scoreRef.current + (correct ? 1 : 0);
    if (correct) {
      scoreRef.current = newScore;
      setScore(newScore);
    }

    const direction = answer === "LEGIT" ? 1 : -1;
    setPopup({ visible: true, correct });

    Animated.parallel([
      Animated.spring(translateX, {
        toValue: direction * CARD_CONFIRM_OFFSET,
        useNativeDriver: true,
        tension: 90,
        friction: 10,
      }),
      Animated.spring(cardScale, {
        toValue: 0.992,
        useNativeDriver: true,
        tension: 90,
        friction: 11,
      }),
    ]).start();

    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    timerRef.current = setTimeout(() => {
      setPopup(null);

      Animated.parallel([
        Animated.timing(translateX, {
          toValue: direction * CARD_EXIT_OFFSET,
          duration: 220,
          useNativeDriver: true,
        }),
        Animated.timing(cardOpacity, {
          toValue: 0,
          duration: 220,
          useNativeDriver: true,
        }),
        Animated.timing(cardScale, {
          toValue: 0.97,
          duration: 220,
          useNativeDriver: true,
        }),
      ]).start(({ finished }) => {
        if (!finished) return;

        if (isLast) {
          router.replace({
            pathname: "/visual-quiz/results",
            params: {
              attemptId,
              score: String(scoreRef.current),
              total: String(total),
            },
          });
          return;
        }

        pendingEntryDirectionRef.current = direction;
        setIndex((currentIndex) => currentIndex + 1);
        setAnswered(false);
        setSelected(null);
      });
    }, 520);
  };

  // PanResponder for swipe (left=Phishing, right=Legit)
  // IMPORTANT: do NOT keep it in useRef, otherwise it can capture stale `card/answered`.
  const panResponder = PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 8 && !answered,
    onPanResponderMove: Animated.event([null, { dx: translateX }], {
      useNativeDriver: false,
    }),
    onPanResponderRelease: (_, g) => {
      if (Math.abs(g.dx) > SWIPE_THRESHOLD) {
        const dir: "PHISHING" | "LEGIT" = g.dx > 0 ? "LEGIT" : "PHISHING";
        handleChoose(dir);
      } else {
        Animated.spring(translateX, {
          toValue: 0,
          useNativeDriver: true,
          bounciness: 8,
        }).start();
      }
    },
    onPanResponderTerminate: () => {
      Animated.spring(translateX, {
        toValue: 0,
        useNativeDriver: true,
        bounciness: 8,
      }).start();
    },
  });

  // style helper for the two choice buttons
  const btnStyle = (kind: "PHISHING" | "LEGIT") => {
    if (!card) {
      return {
        flex: 1,
        padding: 14,
        borderWidth: 1,
        borderRadius: theme.radius,
        alignItems: "center",
        justifyContent: "center",
        borderColor: theme.colors.border,
        backgroundColor: "white",
        opacity: 0.6,
      } as const;
    }

    const pressed = selected === kind;
    const correctChoice = card.isPhish === 1 ? "PHISHING" : "LEGIT";
    const correct = pressed && answered && kind === correctChoice;
    const wrong = pressed && answered && kind !== correctChoice;

    return {
      flex: 1,
      padding: 14,
      borderWidth: 1,
      borderRadius: theme.radius,
      alignItems: "center",
      justifyContent: "center",
      borderColor: wrong
        ? theme.colors.error
        : correct
        ? theme.colors.success
        : theme.colors.border,
      backgroundColor: wrong ? "#fee2e2" : correct ? "#dcfce7" : "white",
      opacity: answered && !pressed ? 0.7 : 1,
    } as const;
  };

  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: "white",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <ActivityIndicator />
      </View>
    );
  }

  if (err || !card) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: "white",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
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

  const imageSource = getVisualAssetSource(card.asset);
  const variantTitle = getVisualQuizVariantById(variant)?.title ?? "Beginner";

  return (
    <View style={{ flex: 1, backgroundColor: "white", padding: 16 }}>
      {/* header / progress */}
      <Text style={{ color: theme.colors.muted, marginBottom: 4 }}>
        {variantTitle}
      </Text>
      <Text style={{ fontSize: 18, fontWeight: "700", marginBottom: 8 }}>
        Card {index + 1} of {total}
      </Text>

      {/* CARD AREA fills available vertical space */}
      <View style={{ flex: 1, minHeight: 300, marginBottom: 16 }}>
        <Animated.View
          style={{
            flex: 1,
            opacity: cardOpacity,
            transform: [{ translateX }, { rotate }, { scale: cardScale }],
          }}
          {...panResponder.panHandlers}
        >
          <View
            style={{
              flex: 1,
              borderRadius: theme.radius,
              borderWidth: 1,
              borderColor: theme.colors.border,
              overflow: "hidden",
              shadowColor: "#000",
              shadowOpacity: 0.08,
              shadowRadius: 8,
              shadowOffset: { width: 0, height: 4 },
              elevation: 5,
              backgroundColor: "white",
            }}
          >
            <Image
              source={imageSource}
              style={{ width: "100%", height: "100%" }}
              resizeMode="contain"
            />

            {/* swipe labels */}
            <Animated.Text
              style={{
                position: "absolute",
                top: 12,
                right: 12,
                paddingVertical: 6,
                paddingHorizontal: 10,
                borderWidth: 2,
                borderColor: theme.colors.error,
                color: theme.colors.error,
                borderRadius: 8,
                fontWeight: "700",
                opacity: nopeOpacity,
                transform: [{ rotate: "12deg" }],
              }}
            >
              PHISHING
            </Animated.Text>

            <Animated.Text
              style={{
                position: "absolute",
                top: 12,
                left: 12,
                paddingVertical: 6,
                paddingHorizontal: 10,
                borderWidth: 2,
                borderColor: theme.colors.success,
                color: theme.colors.success,
                borderRadius: 8,
                fontWeight: "700",
                opacity: likeOpacity,
                transform: [{ rotate: "-12deg" }],
              }}
            >
              LEGIT
            </Animated.Text>

          </View>
        </Animated.View>
      </View>

      {/* choices pinned at bottom */}
      <View style={{ flexDirection: "row", gap: 12 }}>
        <Pressable
          onPress={() => handleChoose("PHISHING")}
          style={btnStyle("PHISHING")}
          disabled={answered}
        >
          <Text style={{ fontWeight: "600" }}>Phishing</Text>
        </Pressable>
        <Pressable
          onPress={() => handleChoose("LEGIT")}
          style={btnStyle("LEGIT")}
          disabled={answered}
        >
          <Text style={{ fontWeight: "600" }}>Legit</Text>
        </Pressable>
      </View>

      <Modal transparent visible={!!popup?.visible} animationType="fade">
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.35)",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
          }}
        >
          <View
            style={{
              backgroundColor: "white",
              paddingVertical: 22,
              paddingHorizontal: 20,
              borderRadius: 16,
              borderWidth: 1,
              borderColor: theme.colors.border,
              minWidth: 240,
              alignItems: "center",
            }}
          >
            <Text
              style={{
                fontSize: 20,
                fontWeight: "800",
                color: popup?.correct
                  ? theme.colors.success
                  : theme.colors.error,
              }}
            >
              {popup?.correct ? "Correct" : "Wrong"}
            </Text>
            <Text
              style={{
                marginTop: 8,
                color: theme.colors.muted,
                textAlign: "center",
              }}
            >
              Preparing the next card...
            </Text>
          </View>
        </View>
      </Modal>
    </View>
  );
}