import { BigShouldersDisplay_900Black } from "@expo-google-fonts/big-shoulders-display";
import { JetBrainsMono_600SemiBold, JetBrainsMono_700Bold } from "@expo-google-fonts/jetbrains-mono";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { SessionProvider } from "../lib/session";
import { color } from "../ui/theme";

export default function RootLayout() {
  const [loaded] = useFonts({ BigShouldersDisplay_900Black, JetBrainsMono_600SemiBold, JetBrainsMono_700Bold });
  if (!loaded) return <View style={{ flex: 1, backgroundColor: color.signalRed }} />;
  return (
    <SafeAreaProvider>
      <SessionProvider>
        <StatusBar style="dark" />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: color.paper } }} />
      </SessionProvider>
    </SafeAreaProvider>
  );
}
