import { Platform } from "react-native";
import { serverUrl } from "./config";

let sent = 0;

/**
 * Sends an error to the game server's log (/api/log), so problems on friends'
 * phones — a join that never connects, a crash — show up in Cloudflare's logs.
 * Fire-and-forget, and capped so a loop can't spam it.
 */
export function reportError(where: string, error: unknown, extra: Record<string, unknown> = {}) {
  if (sent++ >= 20) return;
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  const body = JSON.stringify({
    where,
    message: message.slice(0, 500),
    stack: error instanceof Error ? error.stack?.split("\n").slice(0, 6).join(" | ") : undefined,
    platform: Platform.OS,
    agent: Platform.OS === "web" && typeof navigator !== "undefined" ? navigator.userAgent : undefined,
    page: Platform.OS === "web" && typeof location !== "undefined" ? location.pathname : undefined,
    ...extra,
  });
  fetch(`${serverUrl()}/api/log`, { method: "POST", body }).catch(() => {});
}

/** Report uncaught errors and rejected promises (web and native). */
export function installErrorReporting() {
  if (Platform.OS === "web" && typeof window !== "undefined") {
    window.addEventListener("error", (e) => reportError("window.error", e.error ?? e.message));
    window.addEventListener("unhandledrejection", (e) => reportError("unhandledrejection", e.reason));
    return;
  }
  const g = globalThis as unknown as { ErrorUtils?: { getGlobalHandler(): (e: unknown, fatal?: boolean) => void; setGlobalHandler(h: (e: unknown, fatal?: boolean) => void): void } };
  const previous = g.ErrorUtils?.getGlobalHandler();
  g.ErrorUtils?.setGlobalHandler((e, fatal) => {
    reportError(fatal ? "fatal" : "error", e);
    previous?.(e, fatal);
  });
}
