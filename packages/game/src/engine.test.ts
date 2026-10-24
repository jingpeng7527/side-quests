import { describe, expect, it } from "vitest";
import { apply, authorize, freshQuestCount, newGame, ranking } from "./engine";
import type { GameState, Player, Quest, Submission } from "./types";

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
  it("only the host runs the game", () => {
    expect(authorize(s, { type: "startGame" }, "host")).toBe(true);
    expect(authorize(s, { type: "startGame" }, "ana")).toBe(false);
    expect(authorize(s, { type: "setPhase", phase: "scoreboard" }, "ana")).toBe(false);
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
