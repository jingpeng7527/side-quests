import { demoPlace, distance, newSeed, type Phase } from "@side-quests/game";
import { jitter, type Lobby } from "./lobby";

const NAMES = ["Juno", "Rook", "Mae", "Ozzie", "Bex", "Tamsin"];

const QUEST_IDEAS = [
  "Get a stranger to rate your outfit out of ten",
  "Take a photo with something taller than a lamppost",
  "Find a menu item nobody in the group can pronounce",
  "Do a slow-motion movie walk past a shop window",
  "Convince someone to show you their lock screen",
  "Find the tiniest door in the neighborhood",
  "Pose like a statue next to an actual statue",
  "Get someone to sign your hand like you're famous",
  "Find a car the exact color of your shoes",
  "Hold a 10-second staring contest with a pigeon",
];

/**
 * Stand-in friends for solo testing. They drive the game through the same
 * actions a real phone would send.
 */
export class Bots {
  private timers = new Set<ReturnType<typeof setTimeout>>();

  constructor(private lobby: Lobby) {}

  private get ids(): string[] {
    return this.lobby.state?.players.filter((p) => p.isBot).map((p) => p.id) ?? [];
  }

  addBot() {
    const s = this.lobby.state;
    if (!s) return;
    const taken = new Set(s.players.map((p) => p.name));
    const name = NAMES.find((n) => !taken.has(n));
    if (!name) return;
    const id = crypto.randomUUID();
    this.lobby.dispatch({ type: "join", player: { id, name, isBot: true } }, "server");
    if (s.phase === "writing") this.writeQuests(id);
  }

  phaseChanged(phase: Phase) {
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
    if (phase === "writing") this.ids.forEach((id) => this.writeQuests(id));
    if (phase === "playing") this.ids.forEach((id) => this.play(id));
    if (phase === "verifying") this.ids.forEach((id) => this.vote(id));
  }

  private after(min: number, max: number, work: () => void) {
    const t = setTimeout(() => {
      this.timers.delete(t);
      work();
    }, (min + Math.random() * (max - min)) * 1000);
    this.timers.add(t);
  }

  private writeQuests(bot: string) {
    const n = 2 + Math.floor(Math.random() * 2);
    // Bots say they're done once they've written their quests.
    this.after(8, 10, () => this.lobby.dispatch({ type: "setReady", playerId: bot, ready: true }, "server"));
    for (let i = 0; i < n; i++) {
      this.after(1.5, 7, () => {
        const s = this.lobby.state;
        if (!s || s.phase !== "writing") return;
        const used = new Set(s.quests.map((q) => q.text));
        const ideas = QUEST_IDEAS.filter((q) => !used.has(q));
        const text = ideas[Math.floor(Math.random() * ideas.length)];
        if (!text) return;
        this.lobby.dispatch(
          {
            type: "addQuest",
            quest: { id: crypto.randomUUID(), text, place: demoPlace(text, this.lobby.hostLocation), authorId: bot, source: "human", included: true },
          },
          "server",
        );
      });
    }
  }

  /** Bots only play while at least one person is here to play with. */
  private get anyoneHere(): boolean {
    const s = this.lobby.state;
    const away = new Set(s?.away ?? []);
    return !!s?.players.some((p) => !p.isBot && !away.has(p.id));
  }

  private play(bot: string) {
    this.after(10, 28, () => {
      const s = this.lobby.state;
      if (!s || s.phase !== "playing") return;
      if (!this.anyoneHere) return this.play(bot);
      const quest = s.quests.find((q) => q.id === s.assignments[bot]);
      if (quest) {
        if (s.settings.allowSkips && Math.random() < 0.12) {
          this.lobby.dispatch({ type: "skip", playerId: bot }, "server");
        } else {
          // Bots actually go to the quest's place, give or take a few steps.
          const base = quest.place?.coordinate ?? this.lobby.hostLocation ?? { latitude: 37.7749, longitude: -122.4194 };
          const spot = jitter(base, quest.place ? 0.0004 : 0.004);
          this.lobby.dispatch(
            {
              type: "submit",
              submission: {
                id: crypto.randomUUID(),
                questId: quest.id,
                playerId: bot,
                proof: { kind: "standin", seed: newSeed() },
                takenAt: Date.now(),
                location: spot,
                distanceFromPlace: quest.place ? distance(spot, quest.place.coordinate) : undefined,
                votes: {},
              },
            },
            "server",
          );
        }
      }
      this.play(bot);
    });
  }

  private vote(bot: string) {
    this.after(7, 9, () => this.lobby.dispatch({ type: "setReady", playerId: bot, ready: true }, "server"));
    for (const sub of this.lobby.state?.submissions ?? []) {
      if (sub.playerId === bot) continue;
      this.after(1, 6, () =>
        this.lobby.dispatch({ type: "vote", submissionId: sub.id, voterId: bot, approve: Math.random() < 0.85 }, "server"),
      );
    }
  }
}
