import type { Action, GameState, ID, Phase, Player, Quest, QuestDifficulty, Submission } from "./types";
import { DEFAULT_POINTS, DEFAULT_SETTINGS, MAX_POINTS, MIN_POINTS, SUBMIT_GRACE_MS, TRANSITION_MS } from "./types";

/** Who sent an action: a player id, or the server itself (bots, AI, clock). */
export type Actor = ID | "server";

export function newGame(code: string, host: Player, opts: { aiMode: GameState["aiMode"]; devTools: boolean }): GameState {
  return {
    code,
    hostId: host.id,
    phase: "lobby",
    players: [{ ...host, name: host.name.trim() || "Host" }],
    quests: [],
    settings: { ...DEFAULT_SETTINGS },
    assignments: {},
    history: {},
    skipsUsed: {},
    submissions: [],
    aiWriting: false,
    ready: {},
    away: [],
    ...opts,
  };
}

// The host moves the game along with requestPhase; the server lands it (setPhase /
// startGame) after everyone has had a few seconds' warning.
const HOST_ONLY = new Set<Action["type"]>(["requestPhase", "cancelTransition", "updateSettings", "toggleQuest", "setQuestPoints"]);
const SERVER_ONLY = new Set<Action["type"]>(["addAIQuests", "setAIWriting", "setPhase", "startGame", "setAway", "setHost", "rateQuests"]);

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
    case "setReady":
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
      const known = s.players.find((p) => p.id === action.player.id);
      // Rejoining keeps your seat; a name typed since then wins over a blank one.
      if (known) {
        const name = action.player.name.trim();
        if (!name || name === known.name) return prev;
        known.name = name;
        return s;
      }
      s.players.push({ ...action.player, name: action.player.name.trim() || nextPlayerName(s) });
      if (s.phase === "playing") assignNext(s, action.player.id, rand);
      return s;
    }
    case "leave": {
      // Before the game, leaving takes you off the list. Once quests are being
      // written, you stay — your quests, proofs and score still count — just away.
      if (s.phase === "lobby") {
        s.players = s.players.filter((p) => p.id !== action.playerId);
      } else if (!(s.away ?? []).includes(action.playerId)) {
        s.away = [...(s.away ?? []), action.playerId];
      }
      delete s.assignments[action.playerId];
      return s;
    }

    case "setPhase":
      if (s.phase === action.phase) return prev;
      s.phase = action.phase;
      s.ready = {};
      delete s.transition;
      return s;

    case "requestPhase":
      if (s.phase === action.phase) return prev;
      s.transition = { to: action.phase, at: now + TRANSITION_MS };
      return s;

    case "cancelTransition":
      if (!s.transition) return prev;
      delete s.transition;
      return s;

    case "setReady":
      if (!!s.ready[action.playerId] === action.ready) return prev;
      s.ready[action.playerId] = action.ready;
      return s;

    case "rateQuests": {
      let changed = false;
      for (const { questId, difficulty } of action.ratings) {
        const q = s.quests.find((x) => x.id === questId);
        // Never overwrite the host's call.
        if (!q || q.difficulty?.by === "host") continue;
        q.difficulty = normalizeDifficulty(difficulty);
        changed = true;
      }
      return changed ? s : prev;
    }

    case "setQuestPoints": {
      const q = s.quests.find((x) => x.id === action.questId);
      // Points are settled once the game starts.
      if (!q || !["lobby", "writing", "review"].includes(s.phase)) return prev;
      const points = clampPoints(action.points);
      const base = q.difficulty ?? { time: 3, nerve: 3, effort: 3, points };
      q.difficulty = { ...base, points, by: "host" };
      return s;
    }

    case "setHost":
      if (s.hostId === action.playerId || !s.players.some((p) => p.id === action.playerId)) return prev;
      s.hostId = action.playerId;
      // A move the old host asked for shouldn't land on the new host's watch.
      delete s.transition;
      return s;

    case "setAway": {
      const away = new Set(s.away ?? []);
      if (away.has(action.playerId) === action.away) return prev;
      if (action.away) away.add(action.playerId);
      else away.delete(action.playerId);
      s.away = [...away];
      return s;
    }

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
      s.ready = {};
      delete s.transition;
      for (const p of shuffled(s.players, rand)) assignNext(s, p.id, rand);
      return s;

    case "submit": {
      const sub = action.submission;
      if (!acceptingProofs(s, sub.takenAt, now) || s.assignments[sub.playerId] !== sub.questId) return prev;
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

/**
 * Proofs are accepted while playing, and — so a slow upload doesn't cost anyone a
 * point — just after the buzzer for photos snapped before it.
 */
export function acceptingProofs(s: GameState, takenAt: number, now = Date.now()): boolean {
  if (s.phase === "playing") return true;
  return s.phase === "ended" && !!s.endsAt && takenAt <= s.endsAt && now <= s.endsAt + SUBMIT_GRACE_MS;
}

/** Players who've said they're done with this phase, and who's still going. */
export function readiness(s: GameState): { ready: Player[]; waiting: Player[]; away: Player[] } {
  const gone = new Set(s.away ?? []);
  const here = s.players.filter((p) => !gone.has(p.id));
  return {
    ready: here.filter((p) => s.ready[p.id]),
    waiting: here.filter((p) => !s.ready[p.id]),
    away: s.players.filter((p) => gone.has(p.id)),
  };
}

/** A name for someone who joined without one: "Player 3". */
export function nextPlayerName(s: GameState): string {
  const taken = new Set(s.players.map((p) => p.name));
  for (let n = s.players.length + 1; ; n++) if (!taken.has(`Player ${n}`)) return `Player ${n}`;
}

/** Who should take over hosting: the first human player who's still here. */
export function nextHost(s: GameState): Player | undefined {
  const away = new Set(s.away ?? []);
  return s.players.find((p) => p.id !== s.hostId && !p.isBot && !away.has(p.id));
}

/** What the host's "move on" button leads to from each phase. */
export const NEXT_PHASE: Partial<Record<Phase, Phase>> = {
  lobby: "writing",
  writing: "review",
  review: "playing",
  ended: "verifying",
  verifying: "scoreboard",
  scoreboard: "writing",
};

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

// Difficulty and points

const clampFactor = (n: number) => Math.min(5, Math.max(1, Math.round(Number(n) || 3)));
export const clampPoints = (n: number) => Math.min(MAX_POINTS, Math.max(MIN_POINTS, Math.round(Number(n) || DEFAULT_POINTS)));

/**
 * Points from the three factors (each 1–5): their average, mapped onto 1–5 —
 * so a quest that's quick, painless and easy is 1, and maxed on all three is 5.
 */
export function pointsFor(d: Pick<QuestDifficulty, "time" | "nerve" | "effort">): number {
  const sum = clampFactor(d.time) + clampFactor(d.nerve) + clampFactor(d.effort);
  return clampPoints(1 + (sum - 3) / 3);
}

/** Clamp factors, derive points, trim the reason — so a rating from anywhere is safe to store. */
export function normalizeDifficulty(d: QuestDifficulty): QuestDifficulty {
  const factors = { time: clampFactor(d.time), nerve: clampFactor(d.nerve), effort: clampFactor(d.effort) };
  return {
    ...factors,
    points: d.by === "host" ? clampPoints(d.points) : pointsFor(factors),
    why: d.why ? String(d.why).trim().slice(0, 120) : undefined,
    by: d.by,
  };
}

/** What completing this quest is worth in this game. */
export function questPoints(s: GameState, q: Quest | undefined): number {
  if (!q) return 0;
  if (s.settings.difficultyScoring === false) return 1;
  return q.difficulty?.points ?? DEFAULT_POINTS;
}

/** Points from a player's verified proofs. */
export function score(s: GameState, playerId: ID): number {
  return s.submissions
    .filter((x) => x.playerId === playerId && isVerified(x))
    .reduce((sum, x) => sum + questPoints(s, s.quests.find((q) => q.id === x.questId)), 0);
}

/** Points a player has claimed so far (before voting) — for the live standings. */
export function claimedPoints(s: GameState, playerId: ID): number {
  return s.submissions
    .filter((x) => x.playerId === playerId)
    .reduce((sum, x) => sum + questPoints(s, s.quests.find((q) => q.id === x.questId)), 0);
}

export function ranking(s: GameState): { player: Player; score: number; verified: number }[] {
  return s.players
    .map((player) => ({
      player,
      score: score(s, player.id),
      verified: s.submissions.filter((x) => x.playerId === player.id && isVerified(x)).length,
    }))
    .sort((a, b) => b.score - a.score || b.verified - a.verified || a.player.name.localeCompare(b.player.name));
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
