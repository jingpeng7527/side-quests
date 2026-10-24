import Constants from "expo-constants";
import { Platform } from "react-native";

/**
 * Where the lobby server lives. In development it's `wrangler dev` on the
 * same machine that serves the JS bundle, so derive it from that host —
 * that works for simulators, emulators and real phones on the same Wi-Fi.
 */
export function serverUrl(): string {
  const configured = process.env.EXPO_PUBLIC_SERVER_URL;
  if (configured) return configured.replace(/\/$/, "");
  if (Platform.OS === "web") return `${window.location.protocol}//${window.location.hostname}:8787`;
  const host = Constants.expoConfig?.hostUri?.split(":")[0];
  if (!host || host === "localhost" || host === "127.0.0.1") {
    // The Android emulator reaches the host machine at 10.0.2.2.
    return Platform.OS === "android" ? "http://10.0.2.2:8787" : "http://localhost:8787";
  }
  return `http://${host}:8787`;
}

export const wsUrl = (code: string) => `${serverUrl().replace(/^http/, "ws")}/api/lobbies/${code}/ws`;
