import { useEffect, useState } from "react";
import { View, Text, Pressable, ActivityIndicator } from "react-native";
import { Link, router } from "expo-router";
import { getBiometricEnabled } from "../src/secure";

export default function Index() {
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    (async () => {
      const enabled = await getBiometricEnabled();
      if (enabled) {
        router.replace("/(auth)/biometric-login");
      } else {
        setChecking(false);
      }
    })();
  }, []);

  if (checking) {
    return (
      <View style={{ flex:1, alignItems:"center", justifyContent:"center" }}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <View style={{ flex:1, alignItems:"center", justifyContent:"center", padding:24 }}>
      <Text style={{ fontSize:26, fontWeight:"700", marginBottom:8 }}>PhishGuard</Text>
      <Text style={{ opacity:0.7, marginBottom:24 }}>Learn to spot phishing fast.</Text>

      <Link href="/(auth)/login" asChild>
        <Pressable accessibilityLabel="Go to Login"
          style={{ padding:14, borderWidth:1, borderRadius:14 }}>
          <Text>Go to Login</Text>
        </Pressable>
      </Link>
    </View>
  );
}
