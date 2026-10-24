import { approvals, formatDistance, isVerified, ranking, rejections, wasAtPlace, type GameState, type Submission } from "@side-quests/game";
import { useState } from "react";
import { Modal, Pressable, ScrollView, View, useWindowDimensions } from "react-native";
import { useGame } from "../lib/session";
import { DevMenu } from "../ui/DevMenu";
import { Halftone, halftones } from "../ui/Halftone";
import { Body, Display, Hairline, Label, PaletteProvider, Screen, SlabButton, Tag, WaitingBar, color, font, space } from "../ui/kit";
import { RouteMap } from "../ui/maps";
import { ProofImage } from "../ui/Proof";

export function EndGameScreen() {
  const { state, me, isHost, send } = useGame();
  const mine = state.submissions.filter((s) => s.playerId === me.id).sort((a, b) => a.takenAt - b.takenAt);
  const route = mine.flatMap((s) => (s.location ? [s.location] : []));

  return (
    <Screen
      index="05"
      title="Time's up"
      tone="signal"
      art={halftones.gameOver}
      accessory={<DevMenu />}
      footer={isHost ? <SlabButton title="Verify proofs" onPress={() => send({ type: "setPhase", phase: "verifying" })} /> : <WaitingBar text="Waiting for verification" />}
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

/** Everyone judges everyone else's proof. */
export function VerifyScreen() {
  const { state, me, isHost, send } = useGame();
  const [zoomed, setZoomed] = useState<Submission | null>(null);
  const others = state.submissions.filter((s) => s.playerId !== me.id).sort((a, b) => a.takenAt - b.takenAt);
  const judged = others.filter((s) => s.votes[me.id] !== undefined).length;

  return (
    <Screen
      index="06"
      title="Verify"
      trailing={`${judged}/${others.length} judged`}
      accessory={<DevMenu />}
      footer={isHost ? <SlabButton title="Final scores" onPress={() => send({ type: "setPhase", phase: "scoreboard" })} /> : <WaitingBar text="Host reveals scores" />}
    >
      <ScrollView contentContainerStyle={{ paddingHorizontal: space.gutter, paddingBottom: space.l }}>
        <Hairline />
        {others.map((sub) => (
          <View key={sub.id}>
            <ProofRow
              sub={sub}
              state={state}
              myVote={sub.votes[me.id]}
              onZoom={() => setZoomed(sub)}
              onVote={(approve) => send({ type: "vote", submissionId: sub.id, voterId: me.id, approve })}
            />
            <Hairline />
          </View>
        ))}
        {!others.length && (
          <Display size={34} color={color.stone} style={{ marginTop: space.xl }}>
            No one else submitted anything. Brutal.
          </Display>
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
            />
          )}
        </Pressable>
      </Modal>
    </Screen>
  );
}

function ProofRow({ sub, state, myVote, onZoom, onVote }: { sub: Submission; state: GameState; myVote?: boolean; onZoom: () => void; onVote: (approve: boolean) => void }) {
  const quest = state.quests.find((q) => q.id === sub.questId);
  const name = state.players.find((p) => p.id === sub.playerId)?.name ?? "—";
  const atPlace = wasAtPlace(sub, quest?.place);
  return (
    <View style={{ flexDirection: "row", gap: space.m, paddingVertical: space.m }}>
      <View style={{ flex: 1, gap: space.s }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.s, flexWrap: "wrap" }}>
          <Label size={11} color={color.signalRed}>
            {name}
          </Label>
          {quest?.place &&
            (atPlace === true ? <Tag text="At the spot" filled /> : atPlace === false ? <Tag text={`${formatDistance(sub.distanceFromPlace ?? 0)} off`} /> : <Tag text="No location" />)}
        </View>
        <Body weight="600">{quest?.text ?? ""}</Body>
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.s }}>
          <VoteButton glyph="✓" active={myVote === true} label="Approve" onPress={() => onVote(true)} />
          <VoteButton glyph="✕" active={myVote === false} label="Reject" onPress={() => onVote(false)} />
          <View style={{ flex: 1 }} />
          <Label size={12}>
            {approvals(sub)}✓ {rejections(sub)}✕
          </Label>
        </View>
      </View>
      <Pressable onPress={onZoom} accessibilityLabel="View photo">
        <ProofImage proof={sub.proof} quest={quest?.text ?? ""} by={name} style={{ width: 96, height: 128 }} />
      </Pressable>
    </View>
  );
}

function VoteButton({ glyph, active, label, onPress }: { glyph: string; active: boolean; label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      style={{ width: 52, height: 40, alignItems: "center", justifyContent: "center", backgroundColor: active ? color.signalRed : "transparent", borderWidth: 2, borderColor: active ? color.signalRed : color.paperLine }}
    >
      <Label size={16} color={active ? color.paperBright : color.inkBlack} style={{ fontFamily: font.monoBold, letterSpacing: 0 }}>
        {glyph}
      </Label>
    </Pressable>
  );
}

export function ScoreboardScreen() {
  const { state, me, isHost, send, leave } = useGame();
  const { width } = useWindowDimensions();
  const ranks = ranking(state);
  const verified = state.submissions.filter(isVerified).sort((a, b) => b.takenAt - a.takenAt);
  const winner = ranks[0];
  const tied = ranks.length > 1 && ranks[1].score === winner?.score;
  const tile = (Math.min(width, 600) - space.gutter * 2 - 4) / 3;

  return (
    <Screen
      index="07"
      title="Scoreboard"
      accessory={<DevMenu />}
      footer={
        <>
          {isHost && <SlabButton title="Run it back" onPress={() => send({ type: "setPhase", phase: "writing" })} />}
          <SlabButton title="Leave lobby" kind="quiet" onPress={leave} />
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
              <Label size={11}>{tied ? "Tied at the top" : "Winner"}</Label>
              <Display size={104} fit={Math.min(width, 600) - space.gutter * 2 - space.l * 2}>
                {winner.player.name}
              </Display>
              <Body weight="600">{winner.score} verified quests</Body>
            </View>
          </PaletteProvider>
        )}

        <View>
          <Hairline />
          {ranks.map((row, i) => (
            <View key={row.player.id}>
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
            </View>
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
