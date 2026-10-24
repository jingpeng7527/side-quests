import type { Action, Coordinate, GameState, Phase, Player } from "./types";

/** Debug-only shortcuts, honored when the server runs with DEV_TOOLS. */
export type DevOp =
  | { op: "seed"; phase: Phase; placeQuest?: boolean }
  | { op: "addBot" }
  | { op: "skipToEnd" }
  | { op: "simulateRounds"; rounds: number }
  | { op: "addTime"; seconds: number }
  | { op: "dealPlaceQuest" }
  | { op: "jump"; phase: "verifying" | "scoreboard" };

export type ClientMessage =
  | { type: "hello"; player: Player; location?: Coordinate }
  | { type: "action"; action: Action }
  | { type: "location"; location: Coordinate }
  | { type: "dev"; dev: DevOp };

export type ServerMessage =
  | { type: "state"; state: GameState; serverNow: number }
  | { type: "error"; message: string };

/** Response from GET /api/directions. */
export interface WalkingRoute {
  /** meters */
  distance: number;
  /** seconds */
  duration: number;
  coordinates: Coordinate[];
}
