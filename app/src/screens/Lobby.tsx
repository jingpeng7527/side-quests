import { DURATION_OPTIONS, type GameSettings, type Player } from "@side-quests/game";
import { useState } from "react";
import { Modal, Pressable, ScrollView, Switch, View, useWindowDimensions } from "react-native";
import QRCode from "react-native-qrcode-svg";
import { useGame } from "../lib/session";
import { DevMenu } from "../ui/DevMenu";
import { halftones } from "../ui/Halftone";
import { Avatar, Body, Display, Hairline, Label, Screen, SlabButton, Tag, WaitingBar, color, space, usePalette } from "../ui/kit";

export function LobbyScreen() {
  const { state, isHost, me, send, dev, leave } = useGame();
  const [editing, setEditing] = useState(false);
  const { width } = useWindowDimensions();

  return (
    <Screen
      index="01"
      title="Lobby"
      trailing={`${state.players.length} in`}
      art={halftones.lobby}
      accessory={<DevMenu />}
      footer={
        <>
          {isHost ? (
            <>
              <SlabButton title="+ Add a bot (testing)" kind="quiet" onPress={() => dev({ op: "addBot" })} />
              <SlabButton title="Write quests" onPress={() => send({ type: "setPhase", phase: "writing" })} />
            </>
          ) : (
            <WaitingBar text="Waiting for host" />
          )}
          <Pressable onPress={leave} style={{ alignItems: "center", paddingTop: space.xs }}>
            <Label>Leave</Label>
          </Pressable>
        </>
      }
    >
      <ScrollView contentContainerStyle={{ paddingHorizontal: space.gutter, gap: space.l, paddingBottom: space.l }}>
        <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between" }}>
          <View style={{ gap: space.xs, flex: 1 }}>
            <Label size={11}>Lobby code</Label>
            <Display size={120} fit={Math.min(width, 600) - space.gutter * 2 - 124} color={color.signalRed} style={{ letterSpacing: 4 }}>
              {state.code}
            </Display>
          </View>
          {/* Phones join by scanning this. */}
          <View style={{ padding: 8, backgroundColor: color.paperBright }}>
            <QRCode value={`sidequests://join/${state.code}`} size={96} color={color.inkBlack} backgroundColor={color.paperBright} />
          </View>
        </View>
        <Body size={15} color={color.stone} style={{ maxWidth: 320 }}>
          {isHost ? "Friends scan the code with Join a lobby — or type the four letters." : "You're in. Waiting for the host to kick things off."}
        </Body>

        <View>
          <Hairline />
          {state.players.map((p) => (
            <View key={p.id}>
              <PlayerRow player={p} isHost={p.id === state.hostId} isMe={p.id === me.id} />
              <Hairline />
            </View>
          ))}
        </View>

        <SettingsSummary settings={state.settings} editable={isHost} onEdit={() => setEditing(true)} />
      </ScrollView>
      <GameSettingsSheet visible={editing} onClose={() => setEditing(false)} />
    </Screen>
  );
}

export function PlayerRow({ player, isHost, isMe, trailing }: { player: Player; isHost?: boolean; isMe?: boolean; trailing?: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space.m, paddingVertical: 10 }}>
      <Avatar name={player.name} highlighted={isMe} />
      <Display size={32} style={{ textTransform: "none" }}>
        {player.name}
      </Display>
      {isHost && <Tag text="Host" />}
      {player.isBot && <Tag text="Bot" />}
      <View style={{ flex: 1 }} />
      {trailing && <Label>{trailing}</Label>}
    </View>
  );
}

/** "15 MIN · 3 SKIPS · AI REFILLS" with a way into the settings for the host. */
export function SettingsSummary({ settings, editable, onEdit }: { settings: GameSettings; editable: boolean; onEdit: () => void }) {
  const pal = usePalette();
  const summary = [
    `${settings.durationMinutes} min`,
    settings.allowSkips ? `${settings.maxSkips} skips` : "no skips",
    settings.aiRefill ? "AI on" : "AI off",
  ].join(" · ");
  return (
    <Pressable
      disabled={!editable}
      onPress={onEdit}
      style={{ flexDirection: "row", alignItems: "center", gap: space.m, padding: space.m, backgroundColor: pal.raised }}
    >
      <Display size={22}>{"⚙\uFE0E"}</Display>
      <View style={{ flex: 1, gap: 2 }}>
        <Display size={24}>Game settings</Display>
        <Label size={10} numberOfLines={1}>
          {summary}
        </Label>
      </View>
      {editable && <Label color={pal.accent}>Edit →</Label>}
    </Pressable>
  );
}

export function GameSettingsSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { state, send } = useGame();
  const s = state.settings;
  const update = (patch: Partial<GameSettings>) => send({ type: "updateSettings", settings: { ...s, ...patch } });

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <Screen index="⚙" title="Game settings" footer={<SlabButton title="Done" onPress={onClose} />}>
        <ScrollView contentContainerStyle={{ paddingHorizontal: space.gutter, gap: space.l }}>
          <View style={{ gap: space.s }}>
            <Label size={11}>Time</Label>
            <View style={{ flexDirection: "row" }}>
              {DURATION_OPTIONS.map((m) => (
                <Pressable
                  key={m}
                  onPress={() => update({ durationMinutes: m })}
                  style={{
                    flex: 1,
                    minHeight: 56,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: s.durationMinutes === m ? color.signalRed : "transparent",
                    borderWidth: 1,
                    borderColor: color.paperLine,
                  }}
                >
                  <Display size={30} color={s.durationMinutes === m ? color.paperBright : color.inkBlack}>
                    {m}
                  </Display>
                </Pressable>
              ))}
            </View>
            <Label size={10}>Minutes</Label>
          </View>
          <Hairline />
          <ToggleRow title="Skips allowed" value={s.allowSkips} onChange={(v) => update({ allowSkips: v })} />
          {s.allowSkips && (
            <Stepper label="Skips per player" value={s.maxSkips} min={1} max={10} onChange={(v) => update({ maxSkips: v })} />
          )}
          <Hairline />
          <ToggleRow title="AI refills" detail="Write new quests when the deck runs dry" value={s.aiRefill} onChange={(v) => update({ aiRefill: v })} />
          <Stepper label="AI starter quests" value={s.aiStarterCount} min={0} max={10} onChange={(v) => update({ aiStarterCount: v })} />
          <Label size={11}>{state.aiMode === "claude" ? "Quest writer: Claude" : "Quest writer: offline deck (no API key on the server)"}</Label>
        </ScrollView>
      </Screen>
    </Modal>
  );
}

function ToggleRow({ title, detail, value, onChange }: { title: string; detail?: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space.m }}>
      <View style={{ flex: 1 }}>
        <Display size={28}>{title}</Display>
        {detail && <Body size={13} color={color.stone}>{detail}</Body>}
      </View>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: color.signalRed, false: color.paperLine }} thumbColor={color.paperBright} />
    </View>
  );
}

export function Stepper({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void }) {
  const btn = (text: string, next: number) => (
    <Pressable
      disabled={next < min || next > max}
      onPress={() => onChange(next)}
      style={{ width: 44, height: 40, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: color.paperLine, opacity: next < min || next > max ? 0.35 : 1 }}
      accessibilityLabel={`${text === "+" ? "Increase" : "Decrease"} ${label}`}
    >
      <Display size={24}>{text}</Display>
    </Pressable>
  );
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space.s }}>
      <Body style={{ flex: 1 }}>{label}</Body>
      {btn("−", value - 1)}
      <Display size={28} style={{ minWidth: 32, textAlign: "center" }}>
        {value}
      </Display>
      {btn("+", value + 1)}
    </View>
  );
}
