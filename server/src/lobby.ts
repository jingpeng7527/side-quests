import { DurableObject } from "cloudflare:workers";
import {
  apply,
  authorize,
  demoPlace,
  distance,
  freshQuestCount,
  newGame,
  newSeed,
  waitingPlayers,
  type Action,
  type Actor,
  type ClientMessage,
  type Coordinate,
  type DevOp,
  type GameState,
  type Player,
  type Quest,
  type ServerMessage,
} from "@side-quests/game";
import { Bots } from "./bots";
import { writeQuests } from "./quests";

export interface Env {
  LOBBY: DurableObjectNamespace<Lobby>;
  PHOTOS: R2Bucket;
  ANTHROPIC_API_KEY?: string;
  DEV_TOOLS?: string;
}

/**
 * One lobby = one Durable Object. It owns the authoritative game state,
 * applies every action through the shared rules, persists, and broadcasts
 * the new state to every connected phone.
 */
export class Lobby extends DurableObject<Env> {
  state: GameState | null = null;
  /** Last known position of the host — anchors bot photos and demo places. */
  hostLocation?: Coordinate;
  private sockets = new Map<WebSocket, string>();
  /** When a top-up adds nothing new (deck exhausted, duplicates), wait before asking again. */
  private aiRetryAfter = 0;
  private bots = new Bots(this);

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.state = (await ctx.storage.get<GameState>("state")) ?? null;
      // Lobbies saved before these fields existed; and after a restart nobody is connected yet.
      if (this.state) {
        this.state.ready ??= {};
        this.state.away = this.state.players.filter((p) => !p.isBot).map((p) => p.id);
      }
    });
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/init" && request.method === "POST") {
      if (this.state) return new Response("taken", { status: 409 });
      const { code, host } = (await request.json()) as { code: string; host: Player };
      this.state = newGame(code, host, {
        aiMode: this.env.ANTHROPIC_API_KEY ? "claude" : "offline",
        devTools: this.env.DEV_TOOLS === "1",
      });
      await this.persist();
      return Response.json({ code });
    }

    if (url.pathname === "/info") {
      if (!this.state) return new Response("no such lobby", { status: 404 });
      const host = this.state.players.find((p) => p.id === this.state!.hostId);
      return Response.json({ code: this.state.code, hostName: host?.name ?? "", players: this.state.players.length, phase: this.state.phase });
    }

    if (request.headers.get("Upgrade") === "websocket") {
      if (!this.state) return new Response("no such lobby", { status: 404 });
      const [client, server] = Object.values(new WebSocketPair());
      server.accept();
      server.addEventListener("message", (e) => this.onMessage(server, e.data as string));
      server.addEventListener("close", () => this.dropSocket(server));
      server.addEventListener("error", () => this.dropSocket(server));
      return new Response(null, { status: 101, webSocket: client });
    }

    return new Response("not found", { status: 404 });
  }

  async alarm() {
    const s = this.state;
    if (s?.phase === "playing" && s.endsAt && Date.now() >= s.endsAt - 250) this.dispatch({ type: "setPhase", phase: "ended" }, "server");
  }

  // MARK: Messages

  private onMessage(ws: WebSocket, raw: string) {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(raw);
    } catch {
      return this.send(ws, { type: "error", message: "bad message" });
    }
    const playerId = this.sockets.get(ws);

    switch (msg.type) {
      case "hello":
        this.sockets.set(ws, msg.player.id);
        if (msg.location) this.noteLocation(msg.player.id, msg.location);
        this.dispatch({ type: "join", player: msg.player }, msg.player.id);
        this.dispatch({ type: "setAway", playerId: msg.player.id, away: false }, "server");
        this.send(ws, this.snapshot());
        return;
      case "location":
        if (playerId) this.noteLocation(playerId, msg.location);
        return;
      case "action":
        if (!playerId) return this.send(ws, { type: "error", message: "say hello first" });
        this.dispatch(msg.action, playerId, ws);
        return;
      case "dev":
        // Dev shortcuts end games and add bots — host only, so a player can't yank everyone along.
        if (!playerId || playerId !== this.state?.hostId || this.env.DEV_TOOLS !== "1") return;
        this.dev(msg.dev, playerId);
        return;
    }
  }

  /** When a player's last connection closes, mark them away so nobody waits on them. */
  private dropSocket(ws: WebSocket) {
    const playerId = this.sockets.get(ws);
    this.sockets.delete(ws);
    if (!playerId || [...this.sockets.values()].includes(playerId)) return;
    if (this.state?.players.some((p) => p.id === playerId)) this.dispatch({ type: "setAway", playerId, away: true }, "server");
  }

  private noteLocation(playerId: string, location: Coordinate) {
    if (playerId === this.state?.hostId) this.hostLocation = location;
  }

  /** Applies an action through the shared rules, then persists, broadcasts and runs host duties. */
  dispatch(action: Action, actor: Actor, from?: WebSocket) {
    const prev = this.state;
    if (!prev) return;
    if (!authorize(prev, action, actor)) {
      if (from) this.send(from, { type: "error", message: `not allowed: ${action.type}` });
      return;
    }
    const next = apply(prev, action);
    if (next === prev) return;
    this.state = next;
    void this.persist();
    this.broadcast();

    if (next.phase !== prev.phase) {
      this.bots.phaseChanged(next.phase);
      if (next.phase === "review") this.writeStarterQuests();
    }
    if (action.type === "startGame" && next.endsAt) void this.ctx.storage.setAlarm(next.endsAt);
    if (action.type === "requestPhase" && next.transition) this.landTransition(next.transition);
    this.topUpQuests();
  }

  /** After everyone's had the heads-up, make the requested phase change — unless the host called it off. */
  private landTransition(t: NonNullable<GameState["transition"]>) {
    setTimeout(() => {
      const s = this.state;
      if (!s?.transition || s.transition.at !== t.at || s.transition.to !== t.to) return;
      if (t.to === "playing" && s.phase === "review") this.dispatch({ type: "startGame" }, "server");
      else this.dispatch({ type: "setPhase", phase: t.to }, "server");
    }, Math.max(0, t.at - Date.now()));
  }

  private snapshot(): ServerMessage {
    return { type: "state", state: this.state!, serverNow: Date.now() };
  }

  private broadcast() {
    const msg = JSON.stringify(this.snapshot());
    for (const ws of this.sockets.keys()) {
      try {
        ws.send(msg);
      } catch {
        this.sockets.delete(ws);
      }
    }
  }

  private send(ws: WebSocket, msg: ServerMessage) {
    try {
      ws.send(JSON.stringify(msg));
    } catch {
      this.sockets.delete(ws);
    }
  }

  private async persist() {
    if (this.state) await this.ctx.storage.put("state", this.state);
  }

  // MARK: AI quests

  private writeStarterQuests() {
    const s = this.state!;
    const have = s.quests.filter((q) => q.source === "ai").length;
    if (s.settings.aiStarterCount > have) this.requestAIQuests(s.settings.aiStarterCount - have);
  }

  /** While playing, keep the deck ahead of the players. */
  private topUpQuests() {
    const s = this.state;
    if (!s || s.phase !== "playing" || !s.settings.aiRefill || s.aiWriting || Date.now() < this.aiRetryAfter) return;
    const waiting = waitingPlayers(s).length;
    if (waiting > 0 || freshQuestCount(s) < Math.max(2, s.players.length)) {
      this.requestAIQuests(Math.max(4, s.players.length + waiting));
    }
  }

  requestAIQuests(count: number) {
    const s = this.state;
    if (!s || s.aiWriting) return;
    this.dispatch({ type: "setAIWriting", writing: true }, "server");
    const human = s.quests.filter((q) => q.source === "human").map((q) => q.text);
    const all = s.quests.map((q) => q.text);
    this.ctx.waitUntil(
      writeQuests(this.env.ANTHROPIC_API_KEY, count, human, all).then((texts) => {
        const quests: Quest[] = texts.map((text) => ({ id: crypto.randomUUID(), text, authorId: null, source: "ai", included: true }));
        const before = this.state?.quests.length ?? 0;
        // Back off first: otherwise an empty result would trigger the next top-up immediately, forever.
        this.aiRetryAfter = Date.now() + 30_000;
        this.dispatch({ type: "addAIQuests", quests }, "server");
        if ((this.state?.quests.length ?? 0) > before) this.aiRetryAfter = 0;
      }),
    );
  }

  // MARK: Dev shortcuts

  private dev(op: DevOp, requester: string) {
    const s = this.state!;
    switch (op.op) {
      case "addBot":
        this.bots.addBot();
        return;
      case "seed":
        return this.seed(op.phase, op.placeQuest ?? false, requester);
      case "skipToEnd":
        return this.skipToEnd();
      case "simulateRounds":
        return this.simulateRounds(op.rounds);
      case "addTime":
        if (s.endsAt) {
          this.state = { ...s, endsAt: s.endsAt + op.seconds * 1000 };
          void this.ctx.storage.setAlarm(this.state.endsAt!);
          void this.persist();
          this.broadcast();
        }
        return;
      case "dealPlaceQuest":
        return this.dealPlaceQuest(requester);
      case "jump":
        if (s.phase !== "ended" && s.phase !== "verifying") this.skipToEnd();
        if (op.phase === "scoreboard") this.botsVote();
        this.dispatch({ type: "setPhase", phase: op.phase }, "server");
        return;
    }
  }

  /** Ends the game now; if it hadn't started, deals and plays a few rounds first. */
  private skipToEnd() {
    const s = this.state!;
    if (s.phase === "lobby" || s.phase === "writing" || s.phase === "review") {
      if (s.players.length < 2) {
        this.bots.addBot();
        this.bots.addBot();
      }
      this.seedQuests();
      this.dispatch({ type: "startGame" }, "server");
      this.simulateRounds(3);
    }
    this.dispatch({ type: "setPhase", phase: "ended" }, "server");
  }

  /** Everyone — humans included — completes their current quest with a stand-in photo. */
  simulateRounds(rounds: number) {
    const base = this.hostLocation ?? { latitude: 37.7749, longitude: -122.4194 };
    for (let round = 0; round < rounds; round++) {
      for (const p of this.state!.players) {
        const s = this.state!;
        const questId = s.assignments[p.id];
        const quest = s.quests.find((q) => q.id === questId);
        if (!quest) continue;
        let spot = jitter({ latitude: base.latitude + (round + 1) * 0.0018, longitude: base.longitude + (round + 1) * 0.0014 }, 0.0012);
        // Most players make it to the spot; some fudge it from a few blocks away.
        if (quest.place) spot = jitter(quest.place.coordinate, Math.random() < 0.75 ? 0.0003 : 0.006);
        this.dispatch(
          {
            type: "submit",
            submission: {
              id: crypto.randomUUID(),
              questId: quest.id,
              playerId: p.id,
              proof: { kind: "standin", seed: newSeed() },
              takenAt: Date.now() + round * 45_000,
              location: spot,
              distanceFromPlace: quest.place ? distance(spot, quest.place.coordinate) : undefined,
              votes: {},
            },
          },
          "server",
        );
      }
    }
  }

  private botsVote() {
    const s = this.state!;
    for (const sub of s.submissions) {
      for (const p of s.players) {
        if (p.isBot && p.id !== sub.playerId && sub.votes[p.id] === undefined) {
          this.dispatch({ type: "vote", submissionId: sub.id, voterId: p.id, approve: Math.random() < 0.8 }, "server");
        }
      }
    }
  }

  private dealPlaceQuest(playerId: string) {
    const s = this.state!;
    const seen = new Set(s.history[playerId] ?? []);
    const q = s.quests.find((q) => q.place && q.included && q.authorId !== playerId && !seen.has(q.id));
    if (!q) return;
    this.state = { ...s, assignments: { ...s.assignments, [playerId]: q.id } };
    void this.persist();
    this.broadcast();
  }

  private seedQuests() {
    const s = this.state!;
    const ideas = [
      "Get a stranger to rate your outfit out of ten",
      "Find the tiniest door in the neighborhood",
      "Pose like a statue next to an actual statue",
      "Convince someone to swap an object with you",
      "Find a car the exact color of your shoes",
      "Hold a 10-second staring contest with a pigeon",
      "Get someone to sign your hand like you're famous",
      "Recreate an album cover in a doorway",
    ];
    const have = new Set(s.quests.map((q) => q.text));
    ideas.forEach((text, n) => {
      if (have.has(text)) return;
      const author = this.state!.players[n % this.state!.players.length];
      const quest: Quest = {
        id: crypto.randomUUID(),
        text,
        place: demoPlace(text, this.hostLocation),
        authorId: n >= 6 ? null : author.id,
        source: n >= 6 ? "ai" : "human",
        included: true,
      };
      this.dispatch(n >= 6 ? { type: "addAIQuests", quests: [quest] } : { type: "addQuest", quest }, "server");
    });
  }

  /** Launch straight into a seeded game at `phase` (you + three bots), for screenshots and UI work. */
  private seed(phase: GameState["phase"], placeQuest: boolean, requester: string) {
    if (this.state!.phase !== "lobby") return;
    for (let i = 0; i < 3; i++) this.bots.addBot();
    if (phase === "lobby") return;
    this.seedQuests();
    this.dispatch({ type: "setPhase", phase: "writing" }, "server");
    if (phase === "writing") return;
    this.dispatch({ type: "setPhase", phase: "review" }, "server");
    if (phase === "review") return;
    this.dispatch({ type: "startGame" }, "server");
    if (placeQuest) this.dealPlaceQuest(requester);
    if (phase === "playing") return;
    this.simulateRounds(3);
    this.dispatch({ type: "setPhase", phase: "ended" }, "server");
    if (phase === "ended") return;
    this.dev({ op: "jump", phase: phase === "scoreboard" ? "scoreboard" : "verifying" }, requester);
  }
}

export function jitter(c: Coordinate, by: number): Coordinate {
  return { latitude: c.latitude + (Math.random() * 2 - 1) * by, longitude: c.longitude + (Math.random() * 2 - 1) * by };
}
