import { Pressable, Text, View } from "react-native";
import { AntDesign, Ionicons } from "@expo/vector-icons";
import { theme } from "./theme";

type Kind = "google" | "apple" | "anonymous";

export default function ProviderButton({
  kind, onPress, disabled
}: { kind: Kind; onPress: () => void; disabled?: boolean; }) {
  const map = {
    google: { label: "Continue with Google", bg: theme.colors.card, border: theme.colors.border, text: theme.colors.text },
    apple:  { label: "Continue with Apple", bg: theme.colors.text, border: theme.colors.text, text: theme.colors.textInverse },
    anonymous: { label: "Continue as Guest", bg: theme.colors.card, border: theme.colors.border, text: theme.colors.text },
  } as const;

  const s = map[kind];
  return (
    <Pressable
      accessibilityLabel={s.label}
      onPress={onPress}
      disabled={disabled}
      style={({pressed})=>({
        opacity: disabled ? 0.5 : pressed ? 0.75 : 1,
        backgroundColor: s.bg,
        borderWidth: 1,
        borderColor: s.border,
        borderRadius: 12,
        paddingVertical: 12,
        paddingHorizontal: 14,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        minWidth: 260
      })}
    >
      <View>
        {kind === "apple"
          ? <AntDesign name="apple" size={18} color={s.text} />
          : kind === "google"
            ? <AntDesign name="google" size={18} color={s.text} />
            : <Ionicons name="person-outline" size={18} color={s.text} />
        }
      </View>
      <Text style={{ color: s.text }}>{s.label}</Text>
    </Pressable>
  );
}
