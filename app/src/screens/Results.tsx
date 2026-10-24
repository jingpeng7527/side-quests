import { approvals, formatDistance, isVerified, ranking, rejections, wasAtPlace, type GameState, type Submission } from "@side-quests/game";
import * as Haptics from "expo-haptics";
import { useEffect, useState } from "react";
import { Modal, Pressable, ScrollView, View, useWindowDimensions } from "react-native";
import { useGame } from "../lib/session";
import { DevMenu } from "../ui/DevMenu";
import { HostAdvance, HostWaitingBar, ReadyToggle, Reveal, TextAction, listNames } from "../ui/flow";
import { Halftone, halftones } from "../ui/Halftone";
import { Body, Display, Hairline, Label, PaletteProvider, Screen, Tag, color, font, space } from "../ui/kit";
import { RouteMap } from "../ui/maps";
import { ProofImage } from "../ui/Proof";

export function EndGameScreen() {
  const { state, me, isHost } = useGame();
  const mine = state.submissions.filter((s) => s.playerId === me.id).sort((a, b) => a.takenAt - b.takenAt);
  const route = mine.flatMap((s) => (s.location ? [s.location] : []));

  return (
    <Screen
      index="05"
      title="Time's up"
      tone="signal"
      art={halftones.gameOver}
      accessory={<DevMenu />}
      footer={isHost ? <HostAdvance title="Judge the proofs" /> : <HostWaitingBar text="The host starts judging" />}
    >
      <View style={{ flex: 1, paddingHorizontal: space.gutter, gap: space.m }}>
        <View>
          <Display size={124}>Game</Display>
          <Display size={124} style={{ marginTop: -24 }}>
            Over
          </Display>
        </View>
        <View style={{ flexDirection: "row" }}>
          <Stat value={mine.length} label="Quests done" />
          <Stat value={state.skipsUsed[me.id] ?? 0} label="Skipped" />
          <Stat value={state.submissions.length} label="Lobby total" />
        </View>
        {/* Your route: where each proof was snapped, in order. */}
        <View style={{ flex: 1, borderWidth: 3, borderColor: color.paperBright }}>
          {route.length ? (
            <RouteMap style={{ flex: 1 }} points={route} />
          ) : (
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
              <Label>No pins dropped</Label>
            </View>
          )}
        </View>
      </View>
    </Screen>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <View style={{ flex: 1 }}>
      <Display size={52}>{String(value)}</Display>
      <Label size={10}>{label}</Label>
    </View>
  );
}

/** Everyone judges everyone else's proof — photo first, big thumbs. */
export function VerifyScreen() {
  const { state, me, isHost, send } = useGame();
  const { width } = useWindowDimensions();
  const [zoomed, setZoomed] = useState<Submission | null>(null);
  const others = state.submissions.filter((s) => s.playerId !== me.id).sort((a, b) => a.takenAt - b.takenAt);
  const mine = state.submissions.filter((s) => s.playerId === me.id);
  const judged = others.filter((s) => s.votes[me.id] !== undefined).length;
  const allJudged = judged === others.length;
  const cardWidth = Math.min(width, 600) - space.gutter * 2;

  // Judging everything is the same as saying you're done.
  useEffect(() => {
    if (allJudged && !state.ready[me.id]) send({ type: "setReady", playerId: me.id, ready: true });
  }, [allJudged]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Screen
      index="06"
      title="Verify"
      trailing={`${judged}/${others.length} judged`}
      accessory={<DevMenu />}
      footer={isHost ? <HostAdvance title="Final scores" waitingVerb="judging" /> : <ReadyToggle doneLabel="Done judging" notDoneLabel="Keep judging" />}
    >
      <ScrollView contentContainerStyle={{ paddingHorizontal: space.gutter, paddingBottom: space.l, gap: space.xl }}>
        <Body color={color.stone} style={{ maxWidth: 340 }}>
          {others.length
            ? "Did they actually do it? Majority rules — and a tie goes to the player."
            : "No one else submitted anything. Brutal."}
        </Body>
        {others.map((sub, i) => (
          <ProofCard
            key={sub.id}
            index={i}
            sub={sub}
            state={state}
            width={cardWidth}
            myVote={sub.votes[me.id]}
            onZoom={() => setZoomed(sub)}
            onVote={(approve) => {
              void Haptics.selectionAsync().catch(() => {});
              send({ type: "vote", submissionId: sub.id, voterId: me.id, approve });
            }}
          />
        ))}
        {mine.length > 0 && (
          <View style={{ gap: space.s }}>
            <Label size={11}>How yours are doing</Label>
            <Hairline />
            {mine.map((sub) => (
              <View key={sub.id}>
                <View style={{ flexDirection: "row", gap: space.m, alignItems: "center", paddingVertical: space.s }}>
                  <ProofImage proof={sub.proof} quest={state.quests.find((q) => q.id === sub.questId)?.text ?? ""} by={me.name} style={{ width: 48, height: 64 }} />
                  <Body size={15} weight="600" style={{ flex: 1 }}>
                    {state.quests.find((q) => q.id === sub.questId)?.text ?? ""}
                  </Body>
                  <Label size={12} color={isVerified(sub) ? color.signalRed : color.stone}>
                    {approvals(sub)}✓ {rejections(sub)}✕
                  </Label>
                </View>
                <Hairline />
              </View>
            ))}
          </View>
        )}
      </ScrollView>
      <Modal visible={!!zoomed} transparent animationType="fade" onRequestClose={() => setZoomed(null)}>
        <Pressable style={{ flex: 1, backgroundColor: color.inkBlack, alignItems: "center", justifyContent: "center" }} onPress={() => setZoomed(null)}>
          {zoomed && (
            <ProofImage
              proof={zoomed.proof}
              quest={state.quests.find((q) => q.id === zoomed.questId)?.text ?? ""}
              by={state.players.find((p) => p.id === zoomed.playerId)?.name ?? ""}
              large
              style={{ width: "92%", aspectRatio: 3 / 4 }}
              fit="contain"
            />
          )}
        </Pressable>
      </Modal>
    </Screen>
  );
}

function ProofCard({
  sub,
  state,
  width,
  myVote,
  index,
  onZoom,
  onVote,
}: {
  sub: Submission;
  state: GameState;
  width: number;
  myVote?: boolean;
  index: number;
  onZoom: () => void;
  onVote: (approve: boolean) => void;
}) {
  const quest = state.quests.find((q) => q.id === sub.questId);
  const name = state.players.find((p) => p.id === sub.playerId)?.name ?? "—";
  const atPlace = wasAtPlace(sub, quest?.place);
  return (
    <View style={{ gap: space.m }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.s }}>
        <Label size={11} color={color.signalRed}>
          {String(index + 1).padStart(2, "0")}
        </Label>
        <View style={{ width: 18, height: 1, backgroundColor: color.paperLine }} />
        <Label size={11} color={color.inkBlack} style={{ flex: 1 }}>
          {name}
        </Label>
        {quest?.place &&
          (atPlace === true ? <Tag text="At the spot" filled /> : <Tag text={atPlace === false ? `${formatDistance(sub.distanceFromPlace ?? 0)} off` : "No location"} />)}
      </View>
      <Pressable onPress={onZoom} accessibilityLabel={`${name}'s proof — tap to enlarge`}>
        <ProofImage proof={sub.proof} quest={quest?.text ?? ""} by={name} large={width > 240} style={{ width, height: width * 1.1 }} />
      </Pressable>
      <Display size={30} style={{ textTransform: "none" }}>
        {quest?.text ?? ""}
      </Display>
      <View style={{ flexDirection: "row", gap: space.s }}>
        <VoteButton text="Counts" glyph="✓" active={myVote === true} onPress={() => onVote(true)} />
        <VoteButton text="Doesn't" glyph="✕" active={myVote === false} onPress={() => onVote(false)} />
      </View>
      <Label size={11}>
        {`${approvals(sub)} say it counts · ${rejections(sub)} say it doesn't`}
      </Label>
    </View>
  );
}

function VoteButton({ text, glyph, active, onPress }: { text: string; glyph: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={({ pressed }) => ({
        flex: 1,
        minHeight: 56,
        flexDirection: "row",
        gap: space.s,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: active ? color.signalRed : "transparent",
        borderWidth: 2,
        borderColor: active ? color.signalRed : color.inkBlack,
        transform: [{ scale: pressed ? 0.97 : 1 }],
      })}
    >
      <Display size={26} color={active ? color.paperBright : color.inkBlack}>
        {`${glyph} ${text}`}
      </Display>
    </Pressable>
  );
}

export function ScoreboardScreen() {
  const { state, me, isHost, leave } = useGame();
  const { width } = useWindowDimensions();
  const ranks = ranking(state);
  const verified = state.submissions.filter(isVerified).sort((a, b) => b.takenAt - a.takenAt);
  const winner = ranks[0];
  const winners = ranks.filter((r) => r.score === winner?.score).map((r) => r.player.name);
  const tied = winners.length > 1;
  const tile = (Math.min(width, 600) - space.gutter * 2 - 4) / 3;

  return (
    <Screen
      index="07"
      title="Scoreboard"
      accessory={<DevMenu />}
      footer={
        <>
          {isHost && <HostAdvance title="Run it back" />}
          <TextAction title="Leave lobby" onPress={leave} />
        </>
      }
    >
      <ScrollView contentContainerStyle={{ paddingHorizontal: space.gutter, gap: space.l, paddingBottom: space.l }}>
        {winner && winner.score === 0 && (
          <View style={{ backgroundColor: color.paperRaised, padding: space.l }}>
            <Label size={11}>Final</Label>
            <Display size={64}>Nobody scored</Display>
          </View>
        )}
        {winner && winner.score > 0 && (
          <PaletteProvider tone="signal">
            <View style={{ backgroundColor: color.signalRed, padding: space.l, paddingTop: space.l, overflow: "hidden" }}>
              <Halftone spec={halftones.winner} color={color.deepRed} />
              <Label size={11}>{tied ? `${winners.length}-way tie` : "Winner"}</Label>
              <Display size={104} fit={Math.min(width, 600) - space.gutter * 2 - space.l * 2}>
                {tied ? listNames(winners).replace(" and ", " & ") : winner.player.name}
              </Display>
              <Body weight="600">
                {winner.score} verified {winner.score === 1 ? "quest" : "quests"}
              </Body>
            </View>
          </PaletteProvider>
        )}

        <View>
          <Hairline />
          {ranks.map((row, i) => (
            <Reveal key={row.player.id} index={i}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: space.m, paddingVertical: space.s }}>
                <Label size={16} color={i === 0 ? color.signalRed : color.stone} style={{ width: 30, fontFamily: font.monoBold }}>
                  {String(i + 1).padStart(2, "0")}
                </Label>
                <Display size={34} style={{ textTransform: "none" }}>
                  {row.player.name}
                </Display>
                {row.player.id === me.id && <Tag text="You" />}
                <View style={{ flex: 1 }} />
                <Display size={44}>{String(row.score)}</Display>
              </View>
              <Hairline />
            </Reveal>
          ))}
        </View>

        {verified.length > 0 && (
          <View style={{ gap: space.s }}>
            <Label size={11}>The evidence</Label>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 2 }}>
              {verified.map((sub) => {
                const by = state.players.find((p) => p.id === sub.playerId)?.name ?? "";
                return (
                  <View key={sub.id}>
                    <ProofImage proof={sub.proof} quest={state.quests.find((q) => q.id === sub.questId)?.text ?? ""} by={by} style={{ width: tile, height: tile * (4 / 3) }} />
                    <View style={{ position: "absolute", left: 0, bottom: 0, backgroundColor: color.inkBlack, paddingHorizontal: 4, paddingVertical: 2 }}>
                      <Label size={9} color={color.paperBright}>
                        {by}
                      </Label>
                    </View>
                  </View>
                );
              })}
            </View>
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}
