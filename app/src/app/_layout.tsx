import { BigShouldersDisplay_900Black } from "@expo-google-fonts/big-shoulders-display";
import { JetBrainsMono_400Regular, JetBrainsMono_500Medium, JetBrainsMono_600SemiBold, JetBrainsMono_700Bold } from "@expo-google-fonts/jetbrains-mono";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Component, type ReactNode } from "react";
import { Platform, Pressable, Text, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { installErrorReporting, reportError } from "../lib/report";
import { SessionProvider } from "../lib/session";
import { color } from "../ui/theme";

installErrorReporting();

// Web: text fields draw their own focus styling, so drop the browser's boxy outline.
if (Platform.OS === "web" && typeof document !== "undefined") {
  const style = document.createElement("style");
  style.textContent = "input:focus, textarea:focus { outline: none; }";
  document.head.appendChild(style);
}

/** A crash shows a way out (and gets reported) instead of a blank screen. */
class Crashed extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error) {
    reportError("render", error);
  }
  render() {
    if (!this.state.error) return this.props.children;
    const reload = () => {
      if (Platform.OS === "web" && typeof location !== "undefined") location.reload();
      else this.setState({ error: null });
    };
    return (
      <View style={{ flex: 1, backgroundColor: color.signalRed, justifyContent: "center", padding: 24, gap: 16 }}>
        <Text style={{ fontFamily: "BigShouldersDisplay_900Black", fontSize: 56, color: color.paperBright, transform: [{ skewX: "-9deg" }] }}>SOMETHING BROKE</Text>
        <Text style={{ fontFamily: "JetBrainsMono_400Regular", fontSize: 15, color: color.paperBright }}>
          Sorry — the app hit an error. Reloading usually fixes it, and you can rejoin your lobby with the same code.
        </Text>
        <Pressable onPress={reload} accessibilityRole="button" style={{ backgroundColor: color.paperBright, borderRadius: 999, paddingVertical: 16, alignItems: "center" }}>
          <Text style={{ fontFamily: "BigShouldersDisplay_900Black", fontSize: 26, color: color.signalRed }}>RELOAD</Text>
        </Pressable>
      </View>
    );
  }
}

export default function RootLayout() {
  const [loaded] = useFonts({
    BigShouldersDisplay_900Black,
    JetBrainsMono_400Regular,
    JetBrainsMono_500Medium,
    JetBrainsMono_600SemiBold,
    JetBrainsMono_700Bold,
  });
  if (!loaded) return <View style={{ flex: 1, backgroundColor: color.signalRed }} />;
  return (
    <Crashed>
      <SafeAreaProvider>
        <SessionProvider>
          <StatusBar style="dark" />
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: color.paper } }} />
        </SessionProvider>
      </SafeAreaProvider>
    </Crashed>
  );
}
