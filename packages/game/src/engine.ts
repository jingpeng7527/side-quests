import type { Action, GameState, ID, Player, Submission } from "./types";
import { DEFAULT_SETTINGS } from "./types";

/** Who sent an action: a player id, or the server itself (bots, AI, clock). */
export type Actor = ID | "server";

export function newGame(code: string, host: Player, opts: { aiMode: GameState["aiMode"]; devTools: boolean }): GameState {
  return {
    code,
    hostId: host.id,
    phase: "lobby",
    players: [host],
    quests: [],
    settings: { ...DEFAULT_SETTINGS },
    assignments: {},
    history: {},
    skipsUsed: {},
    submissions: [],
    aiWriting: false,
    ...opts,
  };
}

const HOST_ONLY = new Set<Action["type"]>(["setPhase", "updateSettings", "toggleQuest", "startGame"]);
const SERVER_ONLY = new Set<Action["type"]>(["addAIQuests", "setAIWriting"]);

/** Whether `actor` may perform `action`. The server may do anything. */
export function authorize(state: GameState, action: Action, actor: Actor): boolean {
  if (actor === "server") return true;
  if (SERVER_ONLY.has(action.type)) return false;
  if (HOST_ONLY.has(action.type)) return actor === state.hostId;
  switch (action.type) {
    case "join":
      return action.player.id === actor;
    case "leave":
    case "skip":
      return action.playerId === actor;
    case "submit":
      return action.submission.playerId === actor;
    case "vote":
      return action.voterId === actor;
    case "addQuest":
      return action.quest.authorId === actor && action.quest.source === "human";
    case "removeQuest": {
      const q = state.quests.find((q) => q.id === action.questId);
      return !!q && (q.authorId === actor || actor === state.hostId);
    }
    default:
      return false;
  }
}

/**
 * Pure game rules: returns the next state. Only the server runs this for
 * real; clients receive the result.
 */
export function apply(prev: GameState, action: Action, now = Date.now(), rand: () => number = Math.random): GameState {
  // State is plain JSON (it goes over the wire), so a JSON round-trip is a safe deep copy everywhere.
  const s: GameState = JSON.parse(JSON.stringify(prev));

  switch (action.type) {
    case "join": {
      if (s.players.some((p) => p.id === action.player.id)) return prev;
      s.players.push(action.player);
      if (s.phase === "playing") assignNext(s, action.player.id, rand);
      return s;
    }
    case "leave":
      s.players = s.players.filter((p) => p.id !== action.playerId);
      delete s.assignments[action.playerId];
      return s;

    case "setPhase":
      s.phase = action.phase;
      return s;

    case "updateSettings":
      s.settings = action.settings;
      return s;

    case "addQuest": {
      const text = action.quest.text.trim();
      if (!text) return prev;
      s.quests.push({ ...action.quest, text });
      fillWaiting(s, rand);
      return s;
    }
    case "removeQuest":
      s.quests = s.quests.filter((q) => q.id !== action.questId);
      return s;

    case "toggleQuest": {
      const q = s.quests.find((q) => q.id === action.questId);
      if (q) q.included = !q.included;
      return s;
    }
    case "addAIQuests": {
      const existing = new Set(s.quests.map((q) => q.text.toLowerCase()));
      for (const q of action.quests) if (!existing.has(q.text.toLowerCase())) s.quests.push(q);
      s.aiWriting = false;
      fillWaiting(s, rand);
      return s;
    }
    case "setAIWriting":
      s.aiWriting = action.writing;
      return s;

    case "startGame":
      s.phase = "playing";
      s.startedAt = now;
      s.endsAt = now + s.settings.durationMinutes * 60_000;
      s.assignments = {};
      s.history = {};
      s.skipsUsed = {};
      s.submissions = [];
      for (const p of shuffled(s.players, rand)) assignNext(s, p.id, rand);
      return s;

    case "submit": {
      const sub = action.submission;
      if (s.phase !== "playing" || s.assignments[sub.playerId] !== sub.questId) return prev;
      s.submissions.push({ ...sub, votes: {} });
      (s.history[sub.playerId] ??= []).push(sub.questId);
      assignNext(s, sub.playerId, rand);
      return s;
    }
    case "skip": {
      const current = s.assignments[action.playerId];
      const used = s.skipsUsed[action.playerId] ?? 0;
      if (s.phase !== "playing" || !s.settings.allowSkips || used >= s.settings.maxSkips || !current) return prev;
      s.skipsUsed[action.playerId] = used + 1;
      (s.history[action.playerId] ??= []).push(current);
      assignNext(s, action.playerId, rand);
      return s;
    }
    case "vote": {
      const sub = s.submissions.find((x) => x.id === action.submissionId);
      if (!sub || sub.playerId === action.voterId) return prev;
      sub.votes[action.voterId] = action.approve;
      return s;
    }
  }
}

/**
 * Deals a quest this player hasn't written or been dealt, preferring ones no
 * one else is on. Leaves the player waiting if the deck is dry.
 */
export function assignNext(s: GameState, playerId: ID, rand: () => number = Math.random) {
  delete s.assignments[playerId];
  const seen = new Set(s.history[playerId] ?? []);
  const taken = new Set(Object.values(s.assignments));
  const eligible = s.quests.filter((q) => q.included && q.authorId !== playerId && !seen.has(q.id));
  const free = eligible.filter((q) => !taken.has(q.id));
  const pick = pickRandom(free, rand) ?? pickRandom(eligible, rand);
  if (pick) s.assignments[playerId] = pick.id;
}

export function fillWaiting(s: GameState, rand: () => number = Math.random) {
  if (s.phase !== "playing") return;
  for (const p of s.players) if (!s.assignments[p.id]) assignNext(s, p.id, rand);
}

/** Quests not currently dealt that at least one player could still get. */
export function freshQuestCount(s: GameState): number {
  const taken = new Set(Object.values(s.assignments));
  return s.quests.filter(
    (q) =>
      q.included &&
      !taken.has(q.id) &&
      s.players.some((p) => q.authorId !== p.id && !(s.history[p.id] ?? []).includes(q.id)),
  ).length;
}

export function waitingPlayers(s: GameState): Player[] {
  return s.players.filter((p) => !s.assignments[p.id]);
}

// Scoring

export const approvals = (sub: Submission) => Object.values(sub.votes).filter(Boolean).length;
export const rejections = (sub: Submission) => Object.values(sub.votes).filter((v) => !v).length;
/** Benefit of the doubt: a tie (including no votes) counts. */
export const isVerified = (sub: Submission) => approvals(sub) >= rejections(sub);

export function score(s: GameState, playerId: ID): number {
  return s.submissions.filter((x) => x.playerId === playerId && isVerified(x)).length;
}

export function ranking(s: GameState): { player: Player; score: number }[] {
  return s.players
    .map((player) => ({ player, score: score(s, player.id) }))
    .sort((a, b) => b.score - a.score || a.player.name.localeCompare(b.player.name));
}

function pickRandom<T>(xs: T[], rand: () => number): T | undefined {
  return xs.length ? xs[Math.floor(rand() * xs.length)] : undefined;
}

function shuffled<T>(xs: T[], rand: () => number): T[] {
  const out = [...xs];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
