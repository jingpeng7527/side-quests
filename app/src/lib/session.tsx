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
import { serverUrl, wsUrl } from "./config";

export const newId = () => Crypto.randomUUID();

interface Session {
  me: Player;
  setName: (name: string) => void;
  state: GameState | null;
  isHost: boolean;
  connecting: boolean;
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
  submitProof: (proof: Proof) => void;
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

  // Identity survives restarts.
  useEffect(() => {
    (async () => {
      let id = await AsyncStorage.getItem("playerId");
      if (!id) {
        id = newId();
        await AsyncStorage.setItem("playerId", id);
      }
      setMe({ id, name: (await AsyncStorage.getItem("playerName")) ?? "" });
    })();
  }, []);

  const setName = useCallback((name: string) => {
    setMe((m) => ({ ...m, name }));
    void AsyncStorage.setItem("playerName", name);
  }, []);

  const raw = useCallback((msg: ClientMessage) => {
    if (ws.current?.readyState === WebSocket.OPEN) ws.current.send(JSON.stringify(msg));
    else queued.current.push(msg);
  }, []);

  const connect = useCallback(
    (code: string) => {
      lobbyCode.current = code;
      setConnecting(true);
      const socket = new WebSocket(wsUrl(code));
      ws.current = socket;
      socket.onopen = () => {
        socket.send(JSON.stringify({ type: "hello", player: meRef.current, location: locationRef.current ?? undefined } satisfies ClientMessage));
        for (const m of queued.current.splice(0)) socket.send(JSON.stringify(m));
      };
      socket.onmessage = (e) => {
        const msg = JSON.parse(String(e.data)) as ServerMessage;
        if (msg.type === "state") {
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
    try {
      const res = await fetch(`${serverUrl()}/api/lobbies`, { method: "POST", body: JSON.stringify({ host: meRef.current }) });
      if (!res.ok) throw new Error(await res.text());
      const { code } = (await res.json()) as { code: string };
      connect(code);
    } catch {
      setError(`Can't reach the game server (${serverUrl()}).`);
      setConnecting(false);
    }
  }, [connect]);

  const joinLobby = useCallback(
    async (input: string) => {
      const code = input.trim().toUpperCase();
      setError(null);
      try {
        const res = await fetch(`${serverUrl()}/api/lobbies/${code}`);
        if (res.status === 404) return setError(`No lobby called ${code}.`);
        if (!res.ok) throw new Error(await res.text());
        connect(code);
      } catch {
        setError(`Can't reach the game server (${serverUrl()}).`);
      }
    },
    [connect],
  );

  const leave = useCallback(() => {
    if (ws.current?.readyState === WebSocket.OPEN && meRef.current.id) {
      ws.current.send(JSON.stringify({ type: "action", action: { type: "leave", playerId: meRef.current.id } } satisfies ClientMessage));
    }
    lobbyCode.current = null;
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
    (proof: Proof) => {
      if (!myQuest) return;
      const here = locationRef.current ?? undefined;
      send({
        type: "submit",
        submission: {
          id: newId(),
          questId: myQuest.id,
          playerId: meRef.current.id,
          proof,
          takenAt: Date.now() + clockOffset,
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
      uploadPhoto,
    }),
    [me, setName, state, connecting, error, clockOffset, location, createLobby, joinLobby, leave, send, dev, myQuest, mySkipsLeft, submitProof],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

/** Downscales a photo and uploads it, returning the proof to submit. */
async function uploadPhoto(uri: string): Promise<Proof> {
  const ctx = ImageManipulator.manipulate(uri);
  ctx.resize({ width: 1080 });
  const image = await ctx.renderAsync();
  const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.7 });
  const blob = await (await fetch(saved.uri)).blob();
  const res = await fetch(`${serverUrl()}/api/photos`, { method: "POST", headers: { "Content-Type": "image/jpeg" }, body: blob });
  if (!res.ok) throw new Error(`upload failed: ${res.status}`);
  const { url } = (await res.json()) as { url: string };
  return { kind: "photo", url };
}
