import { Pressable, Text, View } from "react-native";
import { AntDesign, Ionicons } from "@expo/vector-icons";

type Kind = "google" | "apple" | "anonymous";

export default function ProviderButton({
  kind, onPress, disabled
}: { kind: Kind; onPress: () => void; disabled?: boolean; }) {
  const map = {
    google: { label: "Continue with Google", icon: <AntDesign name="google" size={18} />, bg: "white", border:"#e5e7eb" },
    apple:  { label: "Continue with Apple",  icon: <AntDesign name="apple" size={18} />, bg: "black", border:"black" },
    anonymous: { label: "Continue as Guest", icon: <Ionicons name="person-outline" size={18} />, bg: "white", border:"#e5e7eb" },
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
          ? <AntDesign name="apple" size={18} color={s.bg === "black" ? "white" : "black"} />
          : kind === "google"
            ? <AntDesign name="google" size={18} color={s.bg === "black" ? "white" : "black"} />
            : <Ionicons name="person-outline" size={18} color={s.bg === "black" ? "white" : "black"} />
        }
      </View>
      <Text style={{ color: s.bg === "black" ? "white" : "black" }}>{s.label}</Text>
    </Pressable>
  );
}
