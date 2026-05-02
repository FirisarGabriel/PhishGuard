import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

import { ErrorBanner } from "../src/Feedback";
import { useAuth } from "../src/auth/AuthProvider";
import { createOrganization } from "../src/repos/b2b";
import { theme } from "../src/theme";
import { ui } from "../src/ui";

export default function OrganizationCreateScreen() {
  const { user, refreshAuthState } = useAuth();
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = useCallback(async () => {
    const trimmedName = name.trim();
    if (!user?.id) {
      setError("You must be signed in to create an organization.");
      return;
    }

    if (trimmedName.length < 3) {
      setError("Organization name must have at least 3 characters.");
      return;
    }

    try {
      setError(null);
      setSaving(true);
      await createOrganization({
        name: trimmedName,
        createdBy: user.id,
      });
      await refreshAuthState();
      router.replace("/organization");
    } catch (e: any) {
      setError(e?.message ?? "Failed to create organization.");
    } finally {
      setSaving(false);
    }
  }, [name, refreshAuthState, user?.id]);

  return (
    <ScrollView style={ui.screen} contentContainerStyle={{ padding: 20, gap: 16 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={theme.typography.titleLg}>Create Organization</Text>
          <Text style={{ color: theme.colors.muted }}>
            This creates your first company and makes you the owner.
          </Text>
        </View>

        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => ({
            ...ui.button,
            opacity: pressed ? 0.8 : 1,
            paddingVertical: 10,
            paddingHorizontal: 12,
          })}
        >
          <Ionicons name="close" size={18} />
        </Pressable>
      </View>

      {error && <ErrorBanner message={error} />}

      <View style={ui.screenSection}>
        <Text style={theme.typography.sectionTitle}>Organization details</Text>
        <View style={{ gap: 12, marginTop: 14 }}>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Organization name"
            placeholderTextColor={theme.colors.muted}
            style={ui.input}
            autoCapitalize="words"
            autoCorrect={false}
          />
          <Text style={{ color: theme.colors.muted }}>
            A unique slug is generated automatically.
          </Text>
        </View>
      </View>

      <Pressable
        onPress={onSubmit}
        disabled={saving}
        style={({ pressed }) => ({
          ...ui.buttonPrimary,
          opacity: saving ? 0.6 : pressed ? 0.85 : 1,
        })}
      >
        {saving ? (
          <ActivityIndicator color={theme.colors.textInverse} />
        ) : (
          <Text style={{ color: theme.colors.textInverse, fontWeight: "700" }}>
            Create organization
          </Text>
        )}
      </Pressable>
    </ScrollView>
  );
}