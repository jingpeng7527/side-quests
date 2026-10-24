import Feather from "@expo/vector-icons/Feather";
import { MAX_POINTS, MIN_POINTS, questPoints, type GameState, type Quest, type QuestDifficulty } from "@side-quests/game";
import { ActivityIndicator, Pressable, View } from "react-native";
import { Body, Display, Label, usePalette } from "./kit";
import { color, radius, space } from "./theme";

/** "+3 PTS" — what a quest is worth. `tone` follows the ground it sits on. */
export function PointsBadge({ points, tone = "red", size = "md" }: { points: number; tone?: "red" | "paper" | "outline"; size?: "md" | "lg" }) {
  const bg = { red: color.signalRed, paper: color.paperBright, outline: "transparent" }[tone];
  const fg = { red: color.paperBright, paper: color.signalRed, outline: color.signalRed }[tone];
  const big = size === "lg";
  return (
    <View
      accessibilityLabel={`${points} ${points === 1 ? "point" : "points"}`}
      style={{
        flexDirection: "row",
        alignItems: "baseline",
        gap: 3,
        alignSelf: "flex-start",
        backgroundColor: bg,
        borderRadius: radius.pill,
        borderWidth: tone === "outline" ? 1.5 : 0,
        borderColor: color.signalRed,
        paddingHorizontal: big ? 12 : 9,
        paddingVertical: big ? 4 : 2,
      }}
    >
      <Display size={big ? 26 : 18} color={fg}>
        {`+${points}`}
      </Display>
      <Label size={big ? 11 : 9} bold color={fg}>
        {points === 1 ? "pt" : "pts"}
      </Label>
    </View>
  );
}

const FACTORS: [keyof Pick<QuestDifficulty, "time" | "nerve" | "effort">, string][] = [
  ["time", "Time"],
  ["nerve", "Nerve"],
  ["effort", "Effort"],
];

/** Three small 5-pip meters: TIME ●●●○○  NERVE ●●●●○  EFFORT ●○○○○ */
export function DifficultyMeter({ difficulty }: { difficulty: QuestDifficulty }) {
  const pal = usePalette();
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", columnGap: space.m, rowGap: 4 }} accessibilityLabel={FACTORS.map(([k, l]) => `${l} ${difficulty[k]} of 5`).join(", ")}>
      {FACTORS.map(([key, label]) => (
        <View key={key} style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
          <Label size={9} bold>
            {label}
          </Label>
          <View style={{ flexDirection: "row", gap: 2 }}>
            {[1, 2, 3, 4, 5].map((i) => (
              <View key={i} style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: i <= difficulty[key] ? pal.accent : pal.line }} />
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

/** The rating as its author sees it while writing: points plus the reason, or "rating…". */
export function RatingLine({ quest, state }: { quest: Quest; state: GameState }) {
  if (state.settings.difficultyScoring === false) return null;
  const d = quest.difficulty;
  if (!d) {
    return (
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <ActivityIndicator size="small" color={color.signalRed} />
        <Label size={10}>Rating difficulty…</Label>
      </View>
    );
  }
  return (
    <View style={{ gap: 6 }}>
      <PointsBadge points={questPoints(state, quest)} />
      <DifficultyMeter difficulty={d} />
      {d.why && d.by !== "host" ? (
        <Body size={12} color={color.stone}>
          {d.why}
        </Body>
      ) : null}
    </View>
  );
}

/** Host's points control in review: − N + , with who set it. */
export function PointsStepper({ quest, state, onChange }: { quest: Quest; state: GameState; onChange: (points: number) => void }) {
  const points = questPoints(state, quest);
  const d = quest.difficulty;
  const step = (delta: number) => {
    const next = points + delta;
    return (
      <Pressable
        onPress={() => onChange(next)}
        disabled={next < MIN_POINTS || next > MAX_POINTS}
        accessibilityRole="button"
        accessibilityLabel={`${delta > 0 ? "More" : "Fewer"} points for this quest`}
        hitSlop={6}
        style={{
          width: 32,
          height: 32,
          borderRadius: 16,
          alignItems: "center",
          justifyContent: "center",
          borderWidth: 2,
          borderColor: color.signalRed,
          opacity: next < MIN_POINTS || next > MAX_POINTS ? 0.3 : 1,
        }}
      >
        <Feather name={delta > 0 ? "plus" : "minus"} size={16} color={color.signalRed} />
      </Pressable>
    );
  };
  return (
    <View style={{ alignItems: "flex-end", gap: 2 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        {step(-1)}
        <View style={{ minWidth: 30, alignItems: "center" }}>
          {d ? (
            <Display size={28} color={color.signalRed}>
              {String(points)}
            </Display>
          ) : (
            <ActivityIndicator size="small" color={color.signalRed} />
          )}
        </View>
        {step(1)}
      </View>
      <Label size={8} bold>
        {!d ? "rating…" : d.by === "host" ? "set by you" : d.by === "ai" ? "AI rated" : "estimated"}
      </Label>
    </View>
  );
}
