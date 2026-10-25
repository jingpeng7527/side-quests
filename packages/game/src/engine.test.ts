import { describe, expect, it } from "vitest";
import { acceptingProofs, apply, authorize, averageRating, canJudge, claimedPoints, freshQuestCount, hostAfterGrace, hostAfterLeave, newGame, nextHost, pointsFor, proofsToJudge, ranking, readiness } from "./engine";
import { DEFAULT_POINTS, SUBMIT_GRACE_MS, TRANSITION_MS, type GameState, type Player, type Quest, type QuestDifficulty, type Submission } from "./types";

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
    }, 0, () => 0); // Fixed dealing: a random deal can double up a quest and leave two fresh.
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
    // An unrated quest is worth DEFAULT_POINTS.
    expect(r[0]).toMatchObject({ player: { id: "ana" }, score: DEFAULT_POINTS, verified: 1 });
    expect(r.find((x) => x.player.id === "bo")!.score).toBe(0);
  });
});

describe("round length", () => {
  it("takes any whole number of minutes in range", () => {
    const s = lobby();
    const set = (m: number) => apply(s, { type: "updateSettings", settings: { ...s.settings, durationMinutes: m } }).settings.durationMinutes;
    expect(set(47)).toBe(47);
    expect(set(22.6)).toBe(23);
    expect(set(0)).toBe(1);
    expect(set(100_000)).toBe(12 * 60);
    expect(set(Number.NaN)).toBe(s.settings.durationMinutes);
  });
});

describe("the judging pool", () => {
  const cy: Player = { id: "cy", name: "Cy" };
  /** Four players, each with `each` proofs in, then judging starts. */
  function judging(each: number, rand?: () => number): GameState {
    let s = lobby();
    s = apply(s, { type: "join", player: cy });
    const ids = ["host", "ana", "bo", "cy"];
    s = { ...s, phase: "ended", submissions: ids.flatMap((id) => Array.from({ length: each }, (_, i) => ({ ...proof(`q${i}`, id), ratings: {} }))) };
    return apply(s, { type: "setPhase", phase: "verifying" }, Date.now(), rand);
  }

  it("splits every proof evenly-ish and never to its author", () => {
    for (let i = 0; i < 30; i++) {
      const s = judging(3);
      for (const sub of s.submissions) {
        expect(s.judges![sub.id]).toHaveLength(1);
        expect(s.judges![sub.id]).not.toContain(sub.playerId);
      }
      const loads = s.players.map((p) => proofsToJudge(s, p.id).length);
      expect(loads.reduce((a, b) => a + b, 0)).toBe(12);
      expect(Math.max(...loads) - Math.min(...loads)).toBeLessThanOrEqual(1);
    }
  });

  it("only takes votes and ratings from a proof's judge", () => {
    let s = judging(1);
    const sub = s.submissions[0];
    const judge = s.judges![sub.id][0];
    const bystander = s.players.find((p) => p.id !== judge && p.id !== sub.playerId)!.id;
    expect(apply(s, { type: "vote", submissionId: sub.id, voterId: bystander, approve: false })).toBe(s);
    expect(apply(s, { type: "rateProof", submissionId: sub.id, raterId: bystander, stars: 5 })).toBe(s);
    s = apply(s, { type: "vote", submissionId: sub.id, voterId: judge, approve: true });
    s = apply(s, { type: "rateProof", submissionId: sub.id, raterId: judge, stars: 4 });
    expect(s.submissions[0].votes[judge]).toBe(true);
    expect(s.submissions[0].ratings![judge]).toBe(4);
  });

  it("keeps star ratings optional, whole and in range", () => {
    let s = judging(1);
    const sub = s.submissions[0];
    const judge = s.judges![sub.id][0];
    expect(averageRating(s.submissions)).toBeNull();
    expect(apply(s, { type: "rateProof", submissionId: sub.id, raterId: judge, stars: 9 })).toBe(s);
    expect(apply(s, { type: "rateProof", submissionId: sub.id, raterId: judge, stars: 0 })).toBe(s);
    s = apply(s, { type: "rateProof", submissionId: sub.id, raterId: judge, stars: 3 });
    expect(averageRating(s.submissions)).toEqual({ average: 3, count: 1 });
    s = apply(s, { type: "rateProof", submissionId: sub.id, raterId: judge, stars: null });
    expect(averageRating(s.submissions)).toBeNull();
  });

  it("hands someone's unjudged proofs on when they leave", () => {
    let s = judging(2);
    const leaving = "bo";
    const theirs = proofsToJudge(s, leaving);
    expect(theirs.length).toBeGreaterThan(0);
    s = apply(s, { type: "leave", playerId: leaving });
    expect(proofsToJudge(s, leaving)).toHaveLength(0);
    for (const sub of theirs) {
      const now = s.judges![sub.id];
      expect(now).toHaveLength(1);
      expect(now).not.toContain(sub.playerId);
      expect(now).not.toContain(leaving);
    }
  });

  it("lets anyone but the author judge before judging is dealt", () => {
    const s = { ...lobby(), submissions: [proof("q", "ana")] };
    expect(canJudge(s, s.submissions[0], "bo")).toBe(true);
    expect(canJudge(s, s.submissions[0], "ana")).toBe(false);
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
    // The host isn't counted: moving everyone on is their "done".
    expect(readiness(s).waiting.map((p) => p.id)).toEqual(["bo"]);
    s = apply(s, { type: "setPhase", phase: "review" });
    expect(s.ready).toEqual({});
  });

  it("doesn't wait on players whose phones dropped off", () => {
    let s = apply(lobby(), { type: "setPhase", phase: "writing" });
    s = apply(s, { type: "setAway", playerId: "bo", away: true });
    expect(readiness(s).waiting.map((p) => p.id)).toEqual(["ana"]);
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

describe("host handoff", () => {
  it("immediately selects a connected successor when the host leaves", () => {
    let s = apply(lobby(), { type: "leave", playerId: "host" });
    const heir = hostAfterLeave(s, "host", new Set(["ana", "offline"]));
    expect(heir?.id).toBe("ana");
    s = apply(s, { type: "setHost", playerId: heir!.id });
    expect(s.hostId).toBe("ana");
    expect(s.players.some((p) => p.id === "host")).toBe(false);
    expect(authorize(s, { type: "requestPhase", phase: "writing" }, "ana")).toBe(true);
    expect(authorize(s, { type: "requestPhase", phase: "writing" }, "host")).toBe(false);
  });

  it("uses the grace-period callback only for the same host while they're still away", () => {
    let s = apply(lobby(), { type: "setAway", playerId: "host", away: true });
    expect(hostAfterGrace(s, "host", new Set(["ana", "bo"]))?.id).toBe("ana");
    expect(hostAfterGrace(s, "host", new Set())).toBeUndefined();
    s = apply(s, { type: "setAway", playerId: "host", away: false });
    expect(hostAfterGrace(s, "host", new Set(["ana", "bo"]))).toBeUndefined();
    s = apply(s, { type: "setAway", playerId: "host", away: true });
    s = apply(s, { type: "setHost", playerId: "ana" });
    expect(hostAfterGrace(s, "host", new Set(["bo"]))).toBeUndefined();
  });

  it("preserves game state and grants host controls in every phase", () => {
    for (const phase of ["lobby", "writing", "review", "playing", "ended", "verifying", "scoreboard"] as const) {
      let s: GameState = { ...lobby([quest("h1", "host"), quest("a1", "ana"), quest("b1", "bo")]), phase, endsAt: 1234 };
      s = { ...s, submissions: [proof("h1", "host", "saved")] };
      s = apply(s, { type: "leave", playerId: "host" });
      expect(hostAfterLeave(s, "host", new Set(["ana", "bo"]))?.id).toBe("ana");
      s = apply(s, { type: "setHost", playerId: "ana" });
      expect(s.hostId).toBe("ana");
      expect(s.endsAt).toBe(1234);
      expect(s.quests.map((q) => q.id)).toEqual(["h1", "a1", "b1"]);
      expect(s.submissions.map((sub) => sub.id)).toEqual(["saved"]);
      expect(authorize(s, { type: "requestPhase", phase: "writing" }, "ana")).toBe(true);
      expect(authorize(s, { type: "requestPhase", phase: "writing" }, "host")).toBe(false);
    }
  });

  it("passes hosting to the first human who's still here", () => {
    let s = lobby();
    s = apply(s, { type: "join", player: { id: "bot", name: "Juno", isBot: true } });
    s = apply(s, { type: "setAway", playerId: "host", away: true });
    s = apply(s, { type: "setAway", playerId: "ana", away: true });
    expect(nextHost(s)?.id).toBe("bo");
    s = apply(s, { type: "requestPhase", phase: "writing" });
    s = apply(s, { type: "setHost", playerId: "bo" });
    expect(s.hostId).toBe("bo");
    expect(s.transition?.to).toBe("writing");
    expect(authorize(s, { type: "requestPhase", phase: "writing" }, "bo")).toBe(true);
    expect(authorize(s, { type: "requestPhase", phase: "writing" }, "host")).toBe(false);
  });

  it("never hands hosting to a bot, and only the server can hand it over", () => {
    let s = newGame("ABCD", host, { aiMode: "offline", devTools: false });
    s = apply(s, { type: "join", player: { id: "bot", name: "Juno", isBot: true } });
    expect(nextHost(s)).toBeUndefined();
    expect(authorize(s, { type: "setHost", playerId: "ana" }, "ana")).toBe(false);
  });
});

describe("leaving and names", () => {
  it("leaving the lobby takes you off the list; leaving later keeps your score", () => {
    let s = lobby([quest("a1", "ana"), quest("b1", "bo")]);
    expect(apply(s, { type: "leave", playerId: "bo" }).players.map((p) => p.id)).toEqual(["host", "ana"]);
    s = apply(s, { type: "startGame" });
    s = apply(s, { type: "submit", submission: proof(s.assignments.bo, "bo", "p1") });
    s = apply(s, { type: "setPhase", phase: "scoreboard" });
    s = apply(s, { type: "leave", playerId: "bo" });
    expect(s.players.some((p) => p.id === "bo")).toBe(true);
    expect(s.away).toContain("bo");
    expect(ranking(s).find((r) => r.player.id === "bo")?.score).toBe(DEFAULT_POINTS);
  });

  it("gives a blank name a placeholder, and lets a rejoin fix it", () => {
    let s = newGame("ABCD", { id: "host", name: "" }, { aiMode: "offline", devTools: false });
    s = apply(s, { type: "join", player: { id: "x", name: "  " } });
    expect(s.players.find((p) => p.id === "x")?.name).toBe("Player 2");
    s = apply(s, { type: "join", player: { id: "x", name: "Ana" } });
    expect(s.players.find((p) => p.id === "x")?.name).toBe("Ana");
  });
});

describe("difficulty and points", () => {
  const rating = (time: number, nerve: number, effort: number, points = 0): QuestDifficulty => ({ time, nerve, effort, points, by: "ai" });

  it("maps the three factors onto 1–5 points", () => {
    expect(pointsFor({ time: 1, nerve: 1, effort: 1 })).toBe(1);
    expect(pointsFor({ time: 5, nerve: 5, effort: 5 })).toBe(5);
    expect(pointsFor({ time: 2, nerve: 5, effort: 2 })).toBe(3);
    // Out-of-range ratings from a model are clamped, not trusted.
    expect(pointsFor({ time: 99, nerve: -4, effort: 3 })).toBe(3);
  });

  it("scores verified proofs by their quest's points", () => {
    let s = lobby([quest("a1", "ana"), quest("b1", "bo")]);
    s = apply(s, { type: "rateQuests", ratings: [{ questId: "a1", difficulty: rating(5, 5, 5, 1) }, { questId: "b1", difficulty: rating(1, 1, 1, 5) }] });
    // Points come from the factors, whatever the rater claimed.
    expect(s.quests.find((q) => q.id === "a1")?.difficulty?.points).toBe(5);
    expect(s.quests.find((q) => q.id === "b1")?.difficulty?.points).toBe(1);
    s = apply(s, { type: "startGame" }, 0, () => 0);
    const hostQuest = s.assignments.host;
    s = apply(s, { type: "submit", submission: proof(hostQuest, "host", "p1") });
    expect(claimedPoints(s, "host")).toBe(hostQuest === "a1" ? 5 : 1);
    expect(ranking(s)[0]).toMatchObject({ player: { id: "host" }, score: hostQuest === "a1" ? 5 : 1 });
  });

  it("lets the host set points in review, and the rater never overrides them", () => {
    let s = lobby([quest("a1", "ana")]);
    s = apply(s, { type: "setPhase", phase: "review" });
    s = apply(s, { type: "setQuestPoints", questId: "a1", points: 9 });
    expect(s.quests[0].difficulty).toMatchObject({ points: 5, by: "host" });
    s = apply(s, { type: "rateQuests", ratings: [{ questId: "a1", difficulty: rating(1, 1, 1) }] });
    expect(s.quests[0].difficulty?.points).toBe(5);
    expect(authorize(s, { type: "setQuestPoints", questId: "a1", points: 3 }, "ana")).toBe(false);
    expect(authorize(s, { type: "rateQuests", ratings: [] }, "host")).toBe(false);
    // Settled once the game starts.
    s = apply(s, { type: "startGame" });
    expect(apply(s, { type: "setQuestPoints", questId: "a1", points: 1 })).toBe(s);
  });

  it("counts every quest as 1 point when difficulty scoring is off", () => {
    let s = lobby([quest("a1", "ana"), quest("b1", "bo")]);
    s = apply(s, { type: "rateQuests", ratings: [{ questId: "a1", difficulty: rating(5, 5, 5) }, { questId: "b1", difficulty: rating(5, 5, 5) }] });
    s = apply(s, { type: "updateSettings", settings: { ...s.settings, difficultyScoring: false } });
    s = apply(s, { type: "startGame" });
    s = apply(s, { type: "submit", submission: proof(s.assignments.host, "host", "p1") });
    expect(ranking(s)[0].score).toBe(1);
  });
});
