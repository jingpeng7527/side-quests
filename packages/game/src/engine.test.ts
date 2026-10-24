import { describe, expect, it } from "vitest";
import { acceptingProofs, apply, authorize, freshQuestCount, newGame, ranking, readiness } from "./engine";
import { SUBMIT_GRACE_MS, TRANSITION_MS, type GameState, type Player, type Quest, type Submission } from "./types";

const host: Player = { id: "host", name: "Ryan" };
const ana: Player = { id: "ana", name: "Ana" };
const bo: Player = { id: "bo", name: "Bo" };

const quest = (id: string, authorId: string | null, extra: Partial<Quest> = {}): Quest => ({
  id,
  text: `quest ${id}`,
  authorId,
  source: authorId ? "human" : "ai",
  included: true,
  ...extra,
});

const proof = (questId: string, playerId: string, id = `${playerId}-${questId}`): Submission => ({
  id,
  questId,
  playerId,
  proof: { kind: "standin", seed: 1 },
  takenAt: 0,
  votes: {},
});

function lobby(quests: Quest[] = []): GameState {
  let s = newGame("ABCD", host, { aiMode: "offline", devTools: false });
  s = apply(s, { type: "join", player: ana });
  s = apply(s, { type: "join", player: bo });
  for (const q of quests) s = apply(s, { type: "addQuest", quest: q });
  return s;
}

describe("dealing", () => {
  it("never deals a player their own quest", () => {
    for (let i = 0; i < 50; i++) {
      const s = apply(lobby([quest("h1", "host"), quest("a1", "ana"), quest("b1", "bo")]), { type: "startGame" });
      for (const [playerId, questId] of Object.entries(s.assignments)) {
        expect(s.quests.find((q) => q.id === questId)!.authorId).not.toBe(playerId);
      }
    }
  });

  it("skips excluded quests", () => {
    let s = lobby([quest("h1", "host"), quest("a1", "ana", { included: false })]);
    s = apply(s, { type: "startGame" });
    expect(s.assignments.bo).toBe("h1");
  });

  it("deals the next quest after a proof, and leaves you waiting when the deck is dry", () => {
    let s = apply(lobby([quest("a1", "ana"), quest("b1", "bo")]), { type: "startGame" });
    const first = s.assignments.host;
    s = apply(s, { type: "submit", submission: proof(first, "host") });
    expect(s.submissions).toHaveLength(1);
    const second = s.assignments.host;
    expect(second).toBeDefined();
    expect(second).not.toBe(first);
    s = apply(s, { type: "submit", submission: proof(second, "host") });
    expect(s.assignments.host).toBeUndefined();
  });

  it("deals AI quests to players who were waiting", () => {
    let s = apply(lobby([quest("a1", "ana")]), { type: "startGame" });
    expect(s.assignments.ana).toBeUndefined();
    s = apply(s, { type: "addAIQuests", quests: [quest("ai1", null), quest("ai2", null)] });
    expect(s.assignments.ana).toMatch(/^ai/);
  });

  it("rejects a proof for a quest you weren't dealt", () => {
    const s = apply(lobby([quest("a1", "ana"), quest("b1", "bo")]), { type: "startGame" });
    const wrong = s.quests.find((q) => q.id !== s.assignments.host)!.id;
    expect(apply(s, { type: "submit", submission: proof(wrong, "host") })).toBe(s);
  });

  it("counts fresh quests for AI top-ups", () => {
    const s = apply(lobby([quest("h1", "host"), quest("a1", "ana"), quest("b1", "bo"), quest("x", "ana")]), {
      type: "startGame",
    });
    expect(freshQuestCount(s)).toBe(1);
  });
});

describe("skips", () => {
  it("allows up to maxSkips", () => {
    let s = lobby([quest("a1", "ana"), quest("a2", "ana"), quest("a3", "ana"), quest("b1", "bo")]);
    s = apply(s, { type: "updateSettings", settings: { ...s.settings, maxSkips: 1 } });
    s = apply(s, { type: "startGame" });
    s = apply(s, { type: "skip", playerId: "host" });
    expect(s.skipsUsed.host).toBe(1);
    expect(apply(s, { type: "skip", playerId: "host" })).toBe(s);
  });
});

describe("permissions", () => {
  const s = lobby([quest("a1", "ana")]);
  it("only the host moves the game along, and only by asking — the server lands it", () => {
    expect(authorize(s, { type: "requestPhase", phase: "writing" }, "host")).toBe(true);
    expect(authorize(s, { type: "requestPhase", phase: "writing" }, "ana")).toBe(false);
    expect(authorize(s, { type: "cancelTransition" }, "ana")).toBe(false);
    expect(authorize(s, { type: "setPhase", phase: "scoreboard" }, "host")).toBe(false);
    expect(authorize(s, { type: "startGame" }, "host")).toBe(false);
    expect(authorize(s, { type: "startGame" }, "server")).toBe(true);
  });
  it("players mark only themselves ready", () => {
    expect(authorize(s, { type: "setReady", playerId: "ana", ready: true }, "ana")).toBe(true);
    expect(authorize(s, { type: "setReady", playerId: "bo", ready: true }, "ana")).toBe(false);
  });
  it("players act only as themselves", () => {
    expect(authorize(s, { type: "vote", submissionId: "x", voterId: "bo", approve: false }, "ana")).toBe(false);
    expect(authorize(s, { type: "submit", submission: proof("a1", "bo") }, "ana")).toBe(false);
    expect(authorize(s, { type: "addQuest", quest: quest("z", "bo") }, "ana")).toBe(false);
  });
  it("only the server writes AI quests", () => {
    expect(authorize(s, { type: "addAIQuests", quests: [] }, "host")).toBe(false);
    expect(authorize(s, { type: "addAIQuests", quests: [] }, "server")).toBe(true);
  });
  it("authors and the host can remove a quest", () => {
    expect(authorize(s, { type: "removeQuest", questId: "a1" }, "ana")).toBe(true);
    expect(authorize(s, { type: "removeQuest", questId: "a1" }, "host")).toBe(true);
    expect(authorize(s, { type: "removeQuest", questId: "a1" }, "bo")).toBe(false);
  });
});

describe("voting and scoring", () => {
  it("ignores votes on your own proof and ranks by verified proofs", () => {
    let s = apply(lobby([quest("h1", "host"), quest("a1", "ana"), quest("b1", "bo")]), { type: "startGame" });
    s = apply(s, { type: "submit", submission: proof(s.assignments.ana, "ana", "p1") });
    s = apply(s, { type: "submit", submission: proof(s.assignments.bo, "bo", "p2") });
    s = apply(s, { type: "vote", submissionId: "p1", voterId: "ana", approve: true });
    expect(s.submissions[0].votes).toEqual({});
    s = apply(s, { type: "vote", submissionId: "p2", voterId: "host", approve: false });
    s = apply(s, { type: "vote", submissionId: "p2", voterId: "ana", approve: false });
    const r = ranking(s);
    expect(r[0]).toMatchObject({ player: { id: "ana" }, score: 1 });
    expect(r.find((x) => x.player.id === "bo")!.score).toBe(0);
  });
});

describe("moving between phases", () => {
  it("announces a phase change before it lands, and the host can call it off", () => {
    let s = lobby();
    s = apply(s, { type: "requestPhase", phase: "writing" }, 1_000);
    expect(s.phase).toBe("lobby");
    expect(s.transition).toEqual({ to: "writing", at: 1_000 + TRANSITION_MS });
    expect(apply(s, { type: "cancelTransition" }).transition).toBeUndefined();
    s = apply(s, { type: "setPhase", phase: "writing" });
    expect(s.phase).toBe("writing");
    expect(s.transition).toBeUndefined();
  });

  it("tracks who's done, and starts each phase fresh", () => {
    let s = apply(lobby(), { type: "setPhase", phase: "writing" });
    s = apply(s, { type: "setReady", playerId: "ana", ready: true });
    expect(readiness(s).ready.map((p) => p.id)).toEqual(["ana"]);
    expect(readiness(s).waiting).toHaveLength(2);
    s = apply(s, { type: "setPhase", phase: "review" });
    expect(s.ready).toEqual({});
  });

  it("doesn't wait on players whose phones dropped off", () => {
    let s = apply(lobby(), { type: "setPhase", phase: "writing" });
    s = apply(s, { type: "setAway", playerId: "bo", away: true });
    expect(readiness(s).waiting.map((p) => p.id)).toEqual(["host", "ana"]);
    expect(readiness(s).away.map((p) => p.id)).toEqual(["bo"]);
    expect(authorize(s, { type: "setAway", playerId: "ana", away: true }, "ana")).toBe(false);
    s = apply(s, { type: "setAway", playerId: "bo", away: false });
    expect(readiness(s).away).toHaveLength(0);
  });
});

describe("the buzzer", () => {
  it("still takes a photo snapped before time ran out, for a short grace period", () => {
    let s = apply(lobby([quest("a1", "ana"), quest("b1", "bo")]), { type: "startGame" }, 0);
    const end = s.endsAt!;
    s = apply(s, { type: "setPhase", phase: "ended" });
    expect(acceptingProofs(s, end - 1_000, end + 5_000)).toBe(true);
    expect(acceptingProofs(s, end + 1_000, end + 5_000)).toBe(false);
    expect(acceptingProofs(s, end - 1_000, end + SUBMIT_GRACE_MS + 1)).toBe(false);
    const late = apply(s, { type: "submit", submission: { ...proof(s.assignments.host, "host"), takenAt: end - 500 } }, end + 1_000);
    expect(late.submissions).toHaveLength(1);
  });
});
