import { View } from "react-native";
import { theme } from "./theme";

export default function ProgressBar({ value }: { value: number }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <View
      style={{
        height: 10,
        backgroundColor: "#f3f4f6",
        borderRadius: 999,
        borderWidth: 1,
        borderColor: theme.colors.border,
        overflow: "hidden",
      }}
    >
      <View style={{ width: `${v}%`, height: "100%", backgroundColor: theme.colors.success }} />
    </View>
  );
}
