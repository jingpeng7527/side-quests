export type ID = string;

export interface Player {
  id: ID;
  name: string;
  isBot?: boolean;
}

export interface Coordinate {
  latitude: number;
  longitude: number;
}

/** A spot a quest has to be done at. */
export interface QuestPlace {
  name: string;
  coordinate: Coordinate;
  /** How close counts as "there", in meters. */
  radius: number;
}

export const PLACE_RADIUS_OPTIONS = [50, 100, 250] as const;

export type QuestSource = "human" | "ai";

export interface Quest {
  id: ID;
  text: string;
  place?: QuestPlace;
  /** null for AI-written quests. */
  authorId: ID | null;
  source: QuestSource;
  /** Whether the host kept this quest in the deck during review. */
  included: boolean;
}

export interface GameSettings {
  durationMinutes: number;
  allowSkips: boolean;
  maxSkips: number;
  /** Let the AI top up the deck when the human-written quests run out. */
  aiRefill: boolean;
  /** Quests the AI writes up front, before the game starts. */
  aiStarterCount: number;
}

export const DURATION_OPTIONS = [2, 5, 10, 15, 30, 60] as const;

/** How long everyone sees "moving on in…" before a host-requested phase change lands. */
export const TRANSITION_MS = 3_000;

/** A photo snapped before the buzzer still counts if it arrives within this long after. */
export const SUBMIT_GRACE_MS = 30_000;

export const DEFAULT_SETTINGS: GameSettings = {
  durationMinutes: 15,
  allowSkips: true,
  maxSkips: 3,
  aiRefill: true,
  aiStarterCount: 3,
};

/** A real photo in storage (url is server-relative: /api/photos/…), or a generated stand-in (bots, devices without a camera). */
export type Proof = { kind: "photo"; url: string } | { kind: "standin"; seed: number };

export interface Submission {
  id: ID;
  questId: ID;
  playerId: ID;
  proof: Proof;
  /** epoch ms */
  takenAt: number;
  location?: Coordinate;
  /** For quests with a place: meters from it when the photo was taken. */
  distanceFromPlace?: number;
  /** voterId -> approved */
  votes: Record<ID, boolean>;
}

export type Phase = "lobby" | "writing" | "review" | "playing" | "ended" | "verifying" | "scoreboard";

export interface GameState {
  code: string;
  hostId: ID;
  phase: Phase;
  players: Player[];
  quests: Quest[];
  settings: GameSettings;
  /** epoch ms */
  startedAt?: number;
  endsAt?: number;
  /** playerId -> current questId. Missing means waiting for a quest. */
  assignments: Record<ID, ID>;
  /** playerId -> quest ids they've already been dealt (done or skipped). */
  history: Record<ID, ID[]>;
  skipsUsed: Record<ID, number>;
  submissions: Submission[];
  aiWriting: boolean;
  /** Players whose phones have dropped off. They don't hold up "everyone's done". */
  away: ID[];
  /** Who's said they're done with the current phase (writing, judging). Reset on every phase change. */
  ready: Record<ID, boolean>;
  /** A host-requested phase change, announced to everyone a few seconds before it happens. */
  transition?: { to: Phase; at: number };
  /** Whether quest generation is backed by Claude or the offline deck. */
  aiMode: "claude" | "offline";
  /** Whether the server allows dev shortcuts. */
  devTools: boolean;
}

export type Action =
  | { type: "join"; player: Player }
  | { type: "leave"; playerId: ID }
  | { type: "setPhase"; phase: Phase }
  | { type: "requestPhase"; phase: Phase }
  | { type: "cancelTransition" }
  | { type: "setReady"; playerId: ID; ready: boolean }
  | { type: "setAway"; playerId: ID; away: boolean }
  | { type: "updateSettings"; settings: GameSettings }
  | { type: "addQuest"; quest: Quest }
  | { type: "removeQuest"; questId: ID }
  | { type: "toggleQuest"; questId: ID }
  | { type: "addAIQuests"; quests: Quest[] }
  | { type: "setAIWriting"; writing: boolean }
  | { type: "startGame" }
  | { type: "submit"; submission: Submission }
  | { type: "skip"; playerId: ID }
  | { type: "vote"; submissionId: ID; voterId: ID; approve: boolean };
