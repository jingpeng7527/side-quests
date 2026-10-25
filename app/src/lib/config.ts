import Constants from "expo-constants";
import { Platform } from "react-native";

/**
 * Dev shortcuts (the DEV pill, "Add a bot", stand-in photos) are hidden unless
 * the app is built with EXPO_PUBLIC_DEV_MENU=1 — and even then only appear when
 * the server allows them (DEV_TOOLS). The ?demo= links work either way.
 */
export const DEV_MENU = process.env.EXPO_PUBLIC_DEV_MENU === "1";

/** Ports the Expo dev server (Metro) uses for the web app during development. */
const METRO_PORTS = new Set(["8081", "8082", "19006"]);

/**
 * Where the lobby server lives.
 * - Web: the game server serves the web app itself, so it's the page's own
 *   origin — except under the Metro dev server, where it's port 8787 next door.
 * - Native in development: `wrangler dev` on the machine serving the JS bundle,
 *   which works for simulators, emulators and phones on the same Wi-Fi.
 * - Anywhere: EXPO_PUBLIC_SERVER_URL wins (deployed server, tunnels).
 */
export function serverUrl(): string {
  const configured = process.env.EXPO_PUBLIC_SERVER_URL;
  if (configured) return configured.replace(/\/$/, "");
  if (Platform.OS === "web") {
    const { protocol, hostname, port, origin } = window.location;
    return METRO_PORTS.has(port) ? `${protocol}//${hostname}:8787` : origin;
  }
  const host = Constants.expoConfig?.hostUri?.split(":")[0];
  if (!host || host === "localhost" || host === "127.0.0.1") {
    // The Android emulator reaches the host machine at 10.0.2.2.
    return Platform.OS === "android" ? "http://10.0.2.2:8787" : "http://localhost:8787";
  }
  return `http://${host}:8787`;
}

/**
 * The link friends open to join — it serves the web app, so it works in any
 * phone browser with no install or sign-in.
 */
export const joinUrl = (code: string) => `${serverUrl()}/join/${code}`;

export const wsUrl = (code: string) => `${serverUrl().replace(/^http/, "ws")}/api/lobbies/${code}/ws`;

/**
 * `expo start --tunnel` only forwards Metro, so the game server can't be found
 * from the tunnel's address. Returns a message explaining what to do, or null
 * when the server address is usable.
 */
export function serverSetupProblem(): string | null {
  if (process.env.EXPO_PUBLIC_SERVER_URL || Platform.OS === "web") return null;
  const host = Constants.expoConfig?.hostUri?.split(":")[0] ?? "";
  if (/\.exp\.direct$|ngrok/.test(host)) {
    return "You're running through a tunnel, which only carries the app — the game server needs its own public address. Start Expo with EXPO_PUBLIC_SERVER_URL set (see docs/run-on-a-phone.md).";
  }
  return null;
}

/** A human explanation for a failed request to the game server. */
export function describeServerError(error: unknown, res?: Response): string {
  const at = serverUrl();
  if (res) {
    if (res.status === 502 || res.status === 530) {
      return `The tunnel at ${at} is up, but it can't reach the game server behind it. Make sure the server is running and the tunnel points at http://127.0.0.1:8787 (not localhost).`;
    }
    return `The game server at ${at} answered with an error (${res.status}).`;
  }
  if ((error as Error)?.name === "AbortError") return `The game server at ${at} didn't answer in time. Is it running, and can this device reach it?`;
  return `Can't reach the game server at ${at}. Is it running, and is this device on the same network?`;
}

/** fetch() that gives up instead of hanging when the server can't be reached. */
export async function fetchWithTimeout(url: string, init: RequestInit = {}, ms = 8000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}
