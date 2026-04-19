import { View, Text } from "react-native";

export default function Screen() {
  return (
    <View style={{ flex:1, alignItems:"center", justifyContent:"center", padding:24 }}>
      <Text style={{ fontSize:22, fontWeight:"700" }}>Coming soon</Text>
      <Text style={{ marginTop:8, color:"#6b7280" }}>
        This is a mock screen for Part II.
      </Text>
    </View>
  );
}
