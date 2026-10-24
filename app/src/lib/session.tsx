import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  distance,
  type Action,
  type ClientMessage,
  type Coordinate,
  type DevOp,
  type GameState,
  type Player,
  type Proof,
  type Quest,
  type ServerMessage,
} from "@side-quests/game";
import * as Crypto from "expo-crypto";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import * as Location from "expo-location";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Platform } from "react-native";
import { describeServerError, fetchWithTimeout, serverSetupProblem, serverUrl, wsUrl } from "./config";
import { reportError } from "./report";

/**
 * A random v4 UUID. Browsers only offer crypto.randomUUID on secure pages (https
 * or localhost), and friends on a same-Wi-Fi link are on plain http — so build
 * one from getRandomValues, which works everywhere.
 */
export function newId(): string {
  if (Platform.OS !== "web") return Crypto.randomUUID();
  const b = globalThis.crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

interface Session {
  me: Player;
  setName: (name: string) => void;
  state: GameState | null;
  isHost: boolean;
  connecting: boolean;
  /** False while the link to the lobby is down (we're retrying). */
  connected: boolean;
  error: string | null;
  /** Server clock minus device clock, ms — keeps everyone's countdown in sync. */
  clockOffset: number;
  location: Coordinate | null;
  createLobby: () => Promise<void>;
  joinLobby: (code: string) => Promise<void>;
  leave: () => void;
  send: (action: Action) => void;
  dev: (op: DevOp) => void;
  myQuest: Quest | undefined;
  mySkipsLeft: number;
  /** `takenAt` (device ms) is when the photo was snapped, so a slow upload still beats the buzzer. */
  submitProof: (proof: Proof, takenAt?: number) => Promise<void>;
  uploadPhoto: (uri: string) => Promise<Proof>;
}

const SessionContext = createContext<Session | null>(null);

export function useSession(): Session {
  const s = useContext(SessionContext);
  if (!s) throw new Error("useSession outside SessionProvider");
  return s;
}

/** Same as useSession, but asserts we're in a lobby. */
export function useGame() {
  const s = useSession();
  if (!s.state) throw new Error("useGame outside a lobby");
  return { ...s, state: s.state };
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Player>({ id: "", name: "" });
  const [state, setState] = useState<GameState | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [connected, setConnected] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [clockOffset, setClockOffset] = useState(0);
  const [location, setLocation] = useState<Coordinate | null>(null);

  const ws = useRef<WebSocket | null>(null);
  const lobbyCode = useRef<string | null>(null);
  // Socket callbacks outlive renders; they read the latest values through refs.
  const meRef = useRef(me);
  const locationRef = useRef(location);
  const connectRef = useRef<(code: string) => void>(() => {});
  useEffect(() => {
    meRef.current = me;
    locationRef.current = location;
  }, [me, location]);
  const queued = useRef<ClientMessage[]>([]);
  /** The lobby we've received state from — to tell "connecting" from "connected". */
  const gotState = useRef<string | null>(null);

  // Identity survives restarts. Lobby calls wait for it, so nobody joins without an id.
  const [identity] = useState(() => {
    let resolve!: (p: Player) => void;
    const promise = new Promise<Player>((r) => (resolve = r));
    return { promise, resolve };
  });
  useEffect(() => {
    (async () => {
      let player: Player;
      try {
        let id = await AsyncStorage.getItem("playerId");
        if (!id) {
          id = newId();
          await AsyncStorage.setItem("playerId", id);
        }
        player = { id, name: (await AsyncStorage.getItem("playerName")) ?? "" };
      } catch (e) {
        // Storage blocked (private modes, some in-app browsers): play with a one-off id.
        reportError("identity", e);
        player = { id: newId(), name: "" };
      }
      // A name typed before storage answered wins.
      player.name = meRef.current.name || player.name;
      meRef.current = player;
      setMe(player);
      identity.resolve(player);
    })();
  }, [identity]);

  const setName = useCallback((name: string) => {
    // Update the ref now, not after the next render: Create/Join read it right away.
    meRef.current = { ...meRef.current, name };
    setMe((m) => ({ ...m, name }));
    AsyncStorage.setItem("playerName", name).catch(() => {});
  }, []);

  const raw = useCallback((msg: ClientMessage) => {
    if (ws.current?.readyState === WebSocket.OPEN) ws.current.send(JSON.stringify(msg));
    else queued.current.push(msg);
  }, []);

  const connect = useCallback(
    (code: string) => {
      const firstTry = lobbyCode.current !== code;
      lobbyCode.current = code;
      setConnecting(true);
      // If the lobby hasn't answered in a while, say so (we keep retrying underneath).
      if (firstTry) {
        setTimeout(() => {
          if (lobbyCode.current !== code || gotState.current === code) return;
          setError(`Still connecting to lobby ${code}… Check your connection; it'll keep trying.`);
          reportError("connect-timeout", `no state from ${code} after 12s`, { url: wsUrl(code) });
        }, 12_000);
      }
      const socket = new WebSocket(wsUrl(code));
      ws.current = socket;
      socket.onopen = () => {
        setConnected(true);
        socket.send(JSON.stringify({ type: "hello", player: meRef.current, location: locationRef.current ?? undefined } satisfies ClientMessage));
        for (const m of queued.current.splice(0)) socket.send(JSON.stringify(m));
      };
      socket.onmessage = (e) => {
        const msg = JSON.parse(String(e.data)) as ServerMessage;
        if (msg.type === "state") {
          gotState.current = code;
          setClockOffset(msg.serverNow - Date.now());
          setState(msg.state);
          setConnecting(false);
          setError(null);
        } else {
          console.warn("server:", msg.message);
        }
      };
      socket.onclose = () => {
        if (ws.current !== socket) return;
        setConnected(false);
        // Dropped (backgrounded, network blip): reconnect while we're still in this lobby.
        setTimeout(() => {
          if (lobbyCode.current === code && ws.current === socket) connectRef.current(code);
        }, 1500);
      };
    },
    [],
  );

  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  const createLobby = useCallback(async () => {
    setError(null);
    const problem = serverSetupProblem();
    if (problem) return setError(problem);
    setConnecting(true);
    await identity.promise;
    let res: Response | undefined;
    try {
      res = await fetchWithTimeout(`${serverUrl()}/api/lobbies`, { method: "POST", body: JSON.stringify({ host: meRef.current }) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { code } = (await res.json()) as { code: string };
      connect(code);
    } catch (e) {
      setError(describeServerError(e, res && !res.ok ? res : undefined));
      reportError("create", e, { status: res?.status });
      setConnecting(false);
    }
  }, [connect, identity]);

  const joinLobby = useCallback(
    async (input: string) => {
      const code = input.trim().toUpperCase();
      setError(null);
      const problem = serverSetupProblem();
      if (problem) return setError(problem);
      setConnecting(true);
      await identity.promise;
      let res: Response | undefined;
      try {
        res = await fetchWithTimeout(`${serverUrl()}/api/lobbies/${code}`);
        if (res.status === 404) {
          setConnecting(false);
          return setError(`No lobby called ${code} — check the letters with the host.`);
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        connect(code);
      } catch (e) {
        setError(describeServerError(e, res && !res.ok ? res : undefined));
        reportError("join", e, { code, status: res?.status });
        setConnecting(false);
      }
    },
    [connect, identity],
  );

  const leave = useCallback(() => {
    if (ws.current?.readyState === WebSocket.OPEN && meRef.current.id) {
      ws.current.send(JSON.stringify({ type: "action", action: { type: "leave", playerId: meRef.current.id } } satisfies ClientMessage));
    }
    lobbyCode.current = null;
    gotState.current = null;
    setConnecting(false);
    setError(null);
    // Anything still queued belongs to the lobby we're leaving.
    queued.current = [];
    setConnected(true);
    const socket = ws.current;
    ws.current = null;
    socket?.close();
    setState(null);
  }, []);

  const send = useCallback((action: Action) => raw({ type: "action", action }), [raw]);
  const dev = useCallback((op: DevOp) => raw({ type: "dev", dev: op }), [raw]);

  // Location: only while in a lobby. Feeds the quest map and pins proofs.
  useEffect(() => {
    if (!state) return;
    let sub: Location.LocationSubscription | undefined;
    let cancelled = false;
    (async () => {
      const { granted } = await Location.requestForegroundPermissionsAsync();
      if (!granted || cancelled) return;
      sub = await Location.watchPositionAsync({ accuracy: Location.Accuracy.Balanced, distanceInterval: 10 }, (pos) => {
        const c = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
        // Socket handlers and proof submission read this ref before React's
        // state effect has a chance to run.
        locationRef.current = c;
        setLocation(c);
        raw({ type: "location", location: c });
      });
    })().catch(() => {});
    return () => {
      cancelled = true;
      sub?.remove();
    };
  }, [state !== null, raw]); // eslint-disable-line react-hooks/exhaustive-deps

  const myQuest = state ? state.quests.find((q) => q.id === state.assignments[me.id]) : undefined;
  const mySkipsLeft = state?.settings.allowSkips ? Math.max(0, state.settings.maxSkips - (state.skipsUsed[me.id] ?? 0)) : 0;

  const submitProof = useCallback(
    async (proof: Proof, takenAt = Date.now()) => {
      if (!myQuest) return;
      let here = locationRef.current ?? undefined;
      let timeout: ReturnType<typeof setTimeout> | undefined;
      try {
        // Web location watches may pause while Safari opens the camera or
        // photo library. Refresh on submission and retain the watcher fix if
        // a current reading is slow or unavailable.
        const position = await Promise.race([
          Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
          new Promise<null>((resolve) => {
            timeout = setTimeout(() => resolve(null), 5_000);
          }),
        ]);
        if (timeout) clearTimeout(timeout);
        if (position) {
          here = { latitude: position.coords.latitude, longitude: position.coords.longitude };
          locationRef.current = here;
          setLocation(here);
        }
      } catch {
        if (timeout) clearTimeout(timeout);
      }
      send({
        type: "submit",
        submission: {
          id: newId(),
          questId: myQuest.id,
          playerId: meRef.current.id,
          proof,
          takenAt: takenAt + clockOffset,
          location: here,
          distanceFromPlace: myQuest.place && here ? distance(here, myQuest.place.coordinate) : undefined,
          votes: {},
        },
      });
    },
    [myQuest, send, clockOffset],
  );

  const value = useMemo<Session>(
    () => ({
      me,
      setName,
      state,
      isHost: !!state && state.hostId === me.id,
      connecting,
      connected,
      error,
      clockOffset,
      location,
      createLobby,
      joinLobby,
      leave,
      send,
      dev,
      myQuest,
      mySkipsLeft,
      submitProof,
      uploadPhoto: (uri: string) => uploadPhoto(state?.code ?? "", uri),
    }),
    [me, setName, state, connecting, connected, error, clockOffset, location, createLobby, joinLobby, leave, send, dev, myQuest, mySkipsLeft, submitProof],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

/**
 * Downscales a photo and uploads it, returning the proof to submit. The JPEG goes
 * up as base64 JSON: React Native can't reliably fetch() a local file into a body
 * (it silently sent "File not found" instead of the image), and base64 behaves the
 * same on iOS, Android and web.
 */
async function uploadPhoto(code: string, uri: string): Promise<Proof> {
  const ctx = ImageManipulator.manipulate(uri);
  ctx.resize({ width: 1080 });
  const image = await ctx.renderAsync();
  const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.7, base64: true });
  if (!saved.base64) throw new Error("couldn't read the photo");
  // Photos live with their lobby (and are deleted with it).
  const res = await fetchWithTimeout(`${serverUrl()}/api/lobbies/${code}/photos`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data: saved.base64.replace(/^data:image\/\w+;base64,/, "") }),
  }, 30_000);
  if (!res.ok) throw new Error(res.status === 413 ? "that photo is too large" : `upload failed (${res.status})`);
  const { url } = (await res.json()) as { url: string };
  return { kind: "photo", url };
}
