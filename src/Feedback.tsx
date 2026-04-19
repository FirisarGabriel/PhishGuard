import { View, Text, ActivityIndicator, StyleSheet } from "react-native";

export function ErrorBanner({ message }: { message: string }) {
  return (
    <View style={{ backgroundColor:"#fee2e2", borderColor:"#fecaca", borderWidth:1, padding:10, borderRadius:10 }}>
      <Text style={{ color:"#b91c1c" }}>{message}</Text>
    </View>
  );
}

export function LoadingOverlay({ visible, label="Please wait..." }: { visible: boolean; label?: string }) {
  if (!visible) return null;
  return (
    <View style={{
      ...StyleSheet.absoluteFillObject as any,
      backgroundColor:"rgba(0,0,0,0.4)", alignItems:"center", justifyContent:"center"
    }}>
      <View style={{ backgroundColor:"white", padding:16, borderRadius:12, borderWidth:1, borderColor:"#e5e7eb" }}>
        <ActivityIndicator />
        <Text style={{ marginTop:8 }}>{label}</Text>
      </View>
    </View>
  );
}
