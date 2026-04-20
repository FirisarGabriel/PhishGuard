import { View, Text, ActivityIndicator, StyleSheet } from "react-native";
import { theme } from "./theme";

export function ErrorBanner({ message }: { message: string }) {
  return (
    <View style={{ backgroundColor: theme.colors.errorBg, borderColor: theme.colors.errorBorder, borderWidth: 1, padding: 10, borderRadius: 10 }}>
      <Text style={{ color: theme.colors.error }}>{message}</Text>
    </View>
  );
}

export function LoadingOverlay({ visible, label="Please wait..." }: { visible: boolean; label?: string }) {
  if (!visible) return null;
  return (
    <View style={{
      ...StyleSheet.absoluteFillObject as any,
      backgroundColor: theme.colors.overlayBackdrop, alignItems: "center", justifyContent: "center"
    }}>
      <View style={{ backgroundColor: theme.colors.card, padding: 16, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.border }}>
        <ActivityIndicator />
        <Text style={{ marginTop:8 }}>{label}</Text>
      </View>
    </View>
  );
}
