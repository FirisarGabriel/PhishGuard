import { View, Animated } from "react-native";
import { useEffect, useRef, useState } from "react";
import { theme } from "./theme";

export default function ProgressBar({ value }: { value: number }) {
  const v = Math.max(0, Math.min(100, value));
  const [trackWidth, setTrackWidth] = useState(0);
  const animProgress = useRef(new Animated.Value(v / 100)).current;

  useEffect(() => {
    animProgress.stopAnimation();
    Animated.timing(animProgress, {
      toValue: v / 100,
      duration: 180,
      useNativeDriver: true,
    }).start();
  }, [animProgress, v]);

  const translateX = animProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [-trackWidth / 2, 0],
  });

  return (
    <View
      onLayout={(event) => setTrackWidth(event.nativeEvent.layout.width)}
      style={{
        height: 10,
        backgroundColor: theme.colors.cardMuted,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: theme.colors.border,
        overflow: "hidden",
      }}
    >
      <Animated.View
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: "100%",
          backgroundColor: theme.colors.success,
          transform: [{ translateX }, { scaleX: animProgress }],
        }}
      />
    </View>
  );
}
