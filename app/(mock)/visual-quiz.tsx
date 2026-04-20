import { View, Text } from "react-native";
import { theme } from "../../src/theme";

export default function Screen() {
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24, backgroundColor: theme.colors.bg }}>
      <Text style={{ fontSize:22, fontWeight:"700" }}>Coming soon</Text>
      <Text style={{ marginTop: 8, color: theme.colors.muted }}>
        This is a mock screen for Part II.
      </Text>
    </View>
  );
}
