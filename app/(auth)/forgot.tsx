import { useState } from "react";
import { View, Text, TextInput, Pressable, ActivityIndicator, Alert } from "react-native";
import { router } from "expo-router";

// Supabase auth service (password reset via email)
import { sendPasswordReset } from "../../src/auth/service";
import { theme } from "../../src/theme";
import { ui } from "../../src/ui";

export default function Forgot() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);

  const isEmailValid = /\S+@\S+\.\S+/.test(email);

  const onSend = async () => {
    if (!isEmailValid || loading) return;
    try {
      setLoading(true);
      const { error } = await sendPasswordReset(email.trim());
      if (error) {
        Alert.alert("Reset failed", error.message ?? "Please try again.");
        return;
      }
      Alert.alert("Email sent", "Check your inbox for the reset link.");
      router.back();
    } catch (e: any) {
      Alert.alert("Unexpected error", e?.message ?? "Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={{ ...ui.screenPadded, justifyContent: "center", gap: 12 }}>
      <Text style={theme.typography.titleMd}>Reset password</Text>

      <TextInput
        value={email}
        onChangeText={setEmail}
        placeholder="email@example.com"
        placeholderTextColor={theme.colors.muted}
        autoCapitalize="none"
        keyboardType="email-address"
        textContentType="emailAddress"
        style={ui.input}
      />

      <Pressable
        onPress={onSend}
        disabled={!isEmailValid || loading}
        style={{
          ...ui.button,
          opacity: isEmailValid && !loading ? 1 : 0.6,
        }}
        accessibilityLabel="Send password reset email"
      >
        {loading ? <ActivityIndicator /> : <Text>Send reset link</Text>}
      </Pressable>
    </View>
  );
}
