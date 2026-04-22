import "react-native-get-random-values";
import "react-native-url-polyfill/auto";

import { useEffect, useState } from "react";
import { View, ActivityIndicator, Text } from "react-native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";

import { runMigrations } from "../src/db";
import { seedLessonBlocks, seedLessons, seedQuizzes } from "../src/db/seed";
import { AuthProvider } from "../src/auth/AuthProvider";
import { AchievementToastProvider } from "../src/achievements/AchievementToastProvider";
import { theme } from "../src/theme";

function RootFrame({ children }: { children: React.ReactNode }) {
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.bg }} edges={["top"]}>
        {children}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

export default function RootLayout() {
  const [dbReady, setDbReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        await runMigrations();
        await seedLessons();
        await seedLessonBlocks();
        await seedQuizzes();
        if (alive) setDbReady(true);
      } catch (e: any) {
        if (alive) setError(e?.message ?? "Database init failed");
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  if (error) {
    return (
      <RootFrame>
        <View style={{ flex: 1, backgroundColor: theme.colors.bg, alignItems: "center", justifyContent: "center", padding: 24 }}>
          <Text style={{ fontSize: 18, fontWeight: "600", marginBottom: 8 }}>
            Eroare la inițializarea DB
          </Text>
          <Text style={{ textAlign: "center" }}>{error}</Text>
        </View>
      </RootFrame>
    );
  }

  if (!dbReady) {
    return (
      <RootFrame>
        <View style={{ flex: 1, backgroundColor: theme.colors.bg, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator />
          <Text style={{ marginTop: 12 }}>Se pregătește baza de date…</Text>
        </View>
      </RootFrame>
    );
  }

  return (
    <RootFrame>
      <AuthProvider>
        <AchievementToastProvider>
          <Stack screenOptions={{ headerShown: false }} />
        </AchievementToastProvider>
      </AuthProvider>
    </RootFrame>
  );
}
