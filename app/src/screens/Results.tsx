import Feather from "@expo/vector-icons/Feather";
import { approvals, formatDistance, isVerified, ranking, rejections, wasAtPlace, type GameState, type Player, type Submission } from "@side-quests/game";
import * as Haptics from "expo-haptics";
import { useEffect, useState } from "react";
import { Modal, Pressable, ScrollView, View, useWindowDimensions } from "react-native";
import { useGame } from "../lib/session";
import { DevMenu } from "../ui/DevMenu";
import { HostAdvance, HostWaitingBar, ReadyToggle, Reveal, TextAction } from "../ui/flow";
import { Avatar, Body, Display, Hairline, Label, Screen, SectionLabel, Tag, color, radius, space } from "../ui/kit";
import { RouteMap } from "../ui/maps";
import { ProofImage } from "../ui/Proof";

export function EndGameScreen() {
  const { state, me, isHost } = useGame();
  const { width } = useWindowDimensions();
  const w = Math.min(width, 560) - space.gutter * 2;
  const mine = state.submissions.filter((s) => s.playerId === me.id).sort((a, b) => a.takenAt - b.takenAt);
  const route = mine.flatMap((s) => (s.location ? [s.location] : []));

  return (
    <Screen
      title={
        <Label size={14} bold color={color.paperBright}>
          {"Time's up"}
        </Label>
      }
      tone="signal"
      stripes={[{ corner: "tr", color: color.paperBright, bands: [[0.08, 0.06]] }, { corner: "bl", color: color.deepRed, bands: [[0.1, 0.12]] }]}
      right={<DevMenu />}
      footer={isHost ? <HostAdvance title="Judge the proofs" /> : <HostWaitingBar text="Waiting for {host} to start judging" />}
    >
      <ScrollView contentContainerStyle={{ paddingHorizontal: space.gutter, gap: space.l, paddingBottom: space.l }}>
        <View style={{ transform: [{ rotate: "-6deg" }], marginTop: space.s }}>
          <Display size={150} fit={w * 0.85}>
            Game
          </Display>
          <Display size={150} fit={w * 0.85} style={{ marginTop: -w * 0.06 }}>
            Over
          </Display>
        </View>
        <View style={{ flexDirection: "row" }}>
          <Stat value={mine.length} label="Quests done" />
          <Stat value={state.skipsUsed[me.id] ?? 0} label="Skipped" />
          <Stat value={state.submissions.length} label="Lobby total" />
        </View>
        {/* Your route: where each proof was snapped, in order. */}
        <View style={{ height: 240, borderRadius: radius.card, overflow: "hidden", backgroundColor: color.paperBright }}>
          {route.length ? (
            <RouteMap style={{ flex: 1 }} points={route} />
          ) : (
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: space.s }}>
              <Feather name="map" size={28} color={color.stone} />
              <Label>No pins dropped</Label>
            </View>
          )}
        </View>
      </ScrollView>
    </Screen>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <View style={{ flex: 1 }}>
      <Display size={56}>{String(value)}</Display>
      <Label size={10} bold color={color.paperBright}>
        {label}
      </Label>
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
  const cardWidth = Math.min(width, 560) - space.gutter * 2;

  // Judging everything is the same as saying you're done.
  useEffect(() => {
    if (allJudged && !state.ready[me.id]) send({ type: "setReady", playerId: me.id, ready: true });
  }, [allJudged]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Screen
      title="Verify"
      stripes={{ corner: "br", color: color.signalRed, bands: [[0.03, 0.04], [0.11, 0.02]] }}
      right={<DevMenu />}
      footer={isHost ? <HostAdvance title="Final results" waitingVerb="judging" /> : <ReadyToggle label="Done judging" />}
    >
      <ScrollView contentContainerStyle={{ paddingHorizontal: space.gutter, paddingBottom: space.l, gap: space.xl }}>
        <View style={{ gap: 4 }}>
          {others.length > 0 && (
            <Label size={12} bold color={color.signalRed}>
              {judged} of {others.length} judged
            </Label>
          )}
          <Body color={color.stone} style={{ maxWidth: 360 }}>
            {others.length ? "Did they actually do it? Majority rules — a tie goes to the player." : "No one else submitted anything. Brutal."}
          </Body>
        </View>
        {others.map((sub) => (
          <ProofCard
            key={sub.id}
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
            <SectionLabel>How yours are doing</SectionLabel>
            {mine.map((sub) => (
              <View key={sub.id} style={{ flexDirection: "row", gap: space.m, alignItems: "center", paddingVertical: space.xs }}>
                <ProofImage proof={sub.proof} quest={state.quests.find((q) => q.id === sub.questId)?.text ?? ""} by={me.name} style={{ width: 48, height: 64, borderRadius: 10 }} />
                <Body size={13} style={{ flex: 1 }}>
                  {state.quests.find((q) => q.id === sub.questId)?.text ?? ""}
                </Body>
                <Tag text={`${approvals(sub)}✓ ${rejections(sub)}✕`} tone={isVerified(sub) ? "red" : "outline"} />
              </View>
            ))}
          </View>
        )}
      </ScrollView>
      <Modal visible={!!zoomed} transparent animationType="fade" onRequestClose={() => setZoomed(null)}>
        <Pressable style={{ flex: 1, backgroundColor: color.inkBlack, alignItems: "center", justifyContent: "center", padding: space.m }} onPress={() => setZoomed(null)} accessibilityLabel="Close photo">
          {zoomed && (
            <ProofImage
              proof={zoomed.proof}
              quest={state.quests.find((q) => q.id === zoomed.questId)?.text ?? ""}
              by={state.players.find((p) => p.id === zoomed.playerId)?.name ?? ""}
              large
              fit="contain"
              style={{ width: "100%", height: "80%", borderRadius: radius.card }}
            />
          )}
        </Pressable>
      </Modal>
    </Screen>
  );
}

function ProofCard({ sub, state, width, myVote, onZoom, onVote }: { sub: Submission; state: GameState; width: number; myVote?: boolean; onZoom: () => void; onVote: (approve: boolean) => void }) {
  const quest = state.quests.find((q) => q.id === sub.questId);
  const name = state.players.find((p) => p.id === sub.playerId)?.name ?? "—";
  const atPlace = wasAtPlace(sub, quest?.place);
  return (
    <View style={{ gap: space.m }}>
      <Pressable onPress={onZoom} accessibilityLabel={`${name}'s proof — tap to enlarge`}>
        <ProofImage
          proof={sub.proof}
          quest={quest?.text ?? ""}
          by={name}
          large={width > 240}
          style={{ width, height: width * 0.86, borderRadius: radius.card, borderWidth: 3, borderColor: color.signalRed }}
        />
        {quest?.place && (
          <View style={{ position: "absolute", left: 12, top: 12 }}>
            <Tag text={atPlace === true ? "At the spot" : atPlace === false ? `${formatDistance(sub.distanceFromPlace ?? 0)} off` : "No location"} tone={atPlace ? "red" : "paper"} />
          </View>
        )}
      </Pressable>
      <View style={{ gap: 2 }}>
        <Body size={15}>{quest?.text ?? ""}</Body>
        <Body size={14} color={color.stone}>
          — {name}
        </Body>
      </View>
      <View style={{ flexDirection: "row", gap: space.s }}>
        <VoteButton text="Counts" icon="check" active={myVote === true} onPress={() => onVote(true)} />
        <VoteButton text="Doesn't count" icon="x" active={myVote === false} onPress={() => onVote(false)} />
      </View>
      <Label size={11}>{`${approvals(sub)} say it counts · ${rejections(sub)} say it doesn't`}</Label>
    </View>
  );
}

function VoteButton({ text, icon, active, onPress }: { text: string; icon: "check" | "x"; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={({ pressed }) => ({
        flex: 1,
        minHeight: 76,
        gap: 4,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: radius.card,
        backgroundColor: active ? color.signalRed : "transparent",
        borderWidth: 2,
        borderColor: color.signalRed,
        transform: [{ scale: pressed ? 0.97 : 1 }],
      })}
    >
      <Feather name={icon} size={26} color={active ? color.paperBright : color.signalRed} />
      <Label size={12} bold color={active ? color.paperBright : color.signalRed}>
        {text}
      </Label>
    </Pressable>
  );
}

/** One step of the podium. */
function Podium({ player, place, score, quests, isMe }: { player: Player; place: 1 | 2 | 3; score: number; quests: number; isMe: boolean }) {
  const size = place === 1 ? 76 : 52;
  return (
    <View style={{ flex: 1, alignItems: "center", gap: 4, marginTop: place === 1 ? 0 : space.xl }}>
      {place === 1 && <Feather name="award" size={28} color={color.signalRed} />}
      <Avatar name={player.name} size={size} bot={player.isBot} ring={isMe} />
      <Display size={place === 1 ? 40 : 30} color={place === 1 ? color.signalRed : color.inkBlack} skew={false}>
        {String(place)}
      </Display>
      <Body medium size={14} numberOfLines={1} style={{ maxWidth: 110 }}>
        {player.name}
      </Body>
      <Label size={10} numberOfLines={1}>
        {score} verified
      </Label>
    </View>
  );
}

export function ScoreboardScreen() {
  const { state, me, isHost, leave } = useGame();
  const { width } = useWindowDimensions();
  const ranks = ranking(state);
  const verified = state.submissions.filter(isVerified).sort((a, b) => b.takenAt - a.takenAt);
  const tile = (Math.min(width, 560) - space.gutter * 2 - space.s * 2) / 3;
  const done = (id: string) => state.submissions.filter((s) => s.playerId === id).length;
  const [first, second, third] = ranks;
  const nobody = !first || first.score === 0;

  return (
    <Screen
      title="Final results"
      stripes={{ corner: "br", color: color.signalRed, bands: [[0.05, 0.05], [0.15, 0.025]] }}
      right={<DevMenu />}
      footer={
        <>
          {isHost ? <HostAdvance title="Play again" /> : <HostWaitingBar text="{host} can start another round" />}
          <TextAction title="Leave lobby" onPress={leave} />
        </>
      }
    >
      <ScrollView contentContainerStyle={{ paddingHorizontal: space.gutter, gap: space.l, paddingBottom: space.l }}>
        {nobody ? (
          <View style={{ alignItems: "center", paddingVertical: space.l, gap: space.s }}>
            <Display size={56} color={color.signalRed}>
              Nobody scored
            </Display>
            <Body color={color.stone}>Next round, maybe.</Body>
          </View>
        ) : (
          <View style={{ flexDirection: "row", alignItems: "flex-start", paddingTop: space.s }}>
            {second ? <Podium player={second.player} place={2} score={second.score} quests={done(second.player.id)} isMe={second.player.id === me.id} /> : <View style={{ flex: 1 }} />}
            <Podium player={first.player} place={1} score={first.score} quests={done(first.player.id)} isMe={first.player.id === me.id} />
            {third ? <Podium player={third.player} place={3} score={third.score} quests={done(third.player.id)} isMe={third.player.id === me.id} /> : <View style={{ flex: 1 }} />}
          </View>
        )}

        <View>
          <SectionLabel>Everyone</SectionLabel>
          {ranks.map((row, i) => (
            <Reveal key={row.player.id} index={i}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: space.m, paddingVertical: space.s }}>
                <Label size={14} bold color={i === 0 ? color.signalRed : color.stone} style={{ width: 28 }}>
                  {String(i + 1).padStart(2, "0")}
                </Label>
                <Avatar name={row.player.name} size={36} bot={row.player.isBot} ring={row.player.id === me.id} away={state.away?.includes(row.player.id)} />
                <Body medium numberOfLines={1} style={{ flex: 1 }}>
                  {row.player.name}
                  {row.player.id === me.id ? <Body color={color.stone}> (you)</Body> : null}
                </Body>
                {row.player.id === state.hostId && <Tag text="Host" />}
                <Display size={34}>{String(row.score)}</Display>
              </View>
              <Hairline />
            </Reveal>
          ))}
        </View>

        {verified.length > 0 && (
          <View style={{ gap: space.s }}>
            <SectionLabel>The evidence</SectionLabel>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.s }}>
              {verified.map((sub) => {
                const by = state.players.find((p) => p.id === sub.playerId)?.name ?? "";
                return (
                  <View key={sub.id}>
                    <ProofImage proof={sub.proof} quest={state.quests.find((q) => q.id === sub.questId)?.text ?? ""} by={by} style={{ width: tile, height: tile * (4 / 3), borderRadius: 12 }} />
                    <View style={{ position: "absolute", left: 6, bottom: 6 }}>
                      <Tag text={by} tone="ink" />
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
