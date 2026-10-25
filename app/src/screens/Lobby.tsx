import Feather from "@expo/vector-icons/Feather";
import { DURATION_OPTIONS, MAX_DURATION_MINUTES, clampDuration, formatDuration, type GameSettings, type GameState, type Player } from "@side-quests/game";
import { useEffect, useState } from "react";
import { Modal, Platform, Pressable, ScrollView, Share, TextInput, View, useWindowDimensions } from "react-native";
import QRCode from "react-native-qrcode-svg";
import { DEV_MENU, joinUrl } from "../lib/config";
import { useGame } from "../lib/session";
import { Annotation } from "../ui/Annotation";
import { DevMenu } from "../ui/DevMenu";
import { ConfirmSheet, HostAdvance, HostWaitingBar, useToast } from "../ui/flow";
import { Avatar, Body, Button, Display, Hairline, Label, Screen, SectionLabel, SwitchRow, Tag, color, font, radius, space, usePalette } from "../ui/kit";

export function LobbyScreen() {
  const { state, isHost, me, dev, leave } = useGame();
  const [editing, setEditing] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const { width } = useWindowDimensions();
  const toast = useToast();
  const w = Math.min(width, 560) - space.gutter * 2;
  const host = state.players.find((p) => p.id === state.hostId);

  return (
    <Screen
      title="Lobby"
      left={{ icon: "chevron-left", onPress: () => setLeaving(true), label: "Leave lobby" }}
      right={<DevMenu />}
      footer={
        <>
          <Button title="Invite friends" kind="outline" icon="users" size="md" onPress={() => void invite(state.code, toast.show)} />
          {isHost ? <HostAdvance title="Start" /> : <HostWaitingBar text="Waiting for {host} to start" />}
        </>
      }
    >
      <ScrollView contentContainerStyle={{ paddingHorizontal: space.gutter, gap: space.l, paddingBottom: space.l }}>
        <View style={{ alignItems: "center", transform: [{ rotate: "-5deg" }], marginTop: space.s }}>
          <Display size={150} fit={w * 0.92} color={color.signalRed} style={{ letterSpacing: 2 }}>
            {state.code}
          </Display>
        </View>

        <View style={{ alignItems: "center", gap: space.s }}>
          <Label size={12} bold color={color.signalRed}>
            Share this code
          </Label>
          <View style={{ width: "100%", alignItems: "center", justifyContent: "center" }}>
            <View style={{ padding: 10, backgroundColor: color.paperBright, borderRadius: radius.field }}>
              <QRCode value={joinUrl(state.code)} size={Math.min(140, w * 0.42)} color={color.inkBlack} backgroundColor={color.paperBright} />
            </View>
            <Annotation lines={["Scan", "to join"]} color={color.signalRed} size={18} rotate={-12} arrow="down-left" style={{ position: "absolute", left: w / 2 + Math.min(140, w * 0.42) / 2 + 16 }} />
          </View>
        </View>

        <View style={{ gap: space.s }}>
          <SectionLabel right={host ? <Label size={11}>Host: {host.name}</Label> : null}>
            Players ({state.players.length})
          </SectionLabel>
          <Hairline />
          {state.players.map((p) => (
            <View key={p.id}>
              <PlayerRow player={p} state={state} isMe={p.id === me.id} />
              <Hairline />
            </View>
          ))}
          {isHost && DEV_MENU && state.devTools && (
            <Pressable onPress={() => dev({ op: "addBot" })} accessibilityRole="button" style={{ flexDirection: "row", alignItems: "center", gap: space.m, paddingVertical: space.s }}>
              <View style={{ width: 40, height: 40, borderRadius: 20, borderWidth: 2, borderColor: color.signalRed, alignItems: "center", justifyContent: "center" }}>
                <Feather name="plus" size={20} color={color.signalRed} />
              </View>
              <Body medium>Add a bot</Body>
              <Tag text="Testing" tone="outline" />
            </Pressable>
          )}
        </View>

        <SettingsSummary settings={state.settings} editable={isHost} onEdit={() => setEditing(true)} />
      </ScrollView>
      {toast.node}
      <GameSettingsSheet visible={editing} onClose={() => setEditing(false)} />
      <ConfirmSheet
        visible={leaving}
        title="Leave the lobby?"
        body={isHost ? "If you leave, hosting passes to someone else." : "You can rejoin with the code."}
        confirm="Leave"
        onConfirm={() => {
          setLeaving(false);
          leave();
        }}
        onCancel={() => setLeaving(false)}
      />
    </Screen>
  );
}

export function PlayerRow({ player, state, isMe, trailing }: { player: Player; state: GameState; isMe?: boolean; trailing?: string }) {
  const away = state.away?.includes(player.id);
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space.m, paddingVertical: 10 }}>
      <Avatar name={player.name} bot={player.isBot} ring={isMe} away={away} />
      <Body medium size={16} numberOfLines={1} style={{ flexShrink: 1, opacity: away ? 0.5 : 1 }}>
        {player.name}
        {isMe ? <Body color={color.stone}> (you)</Body> : null}
      </Body>
      {player.id === state.hostId && <Tag text="Host" />}
      {player.isBot && <Tag text="Bot" tone="gray" />}
      {away && <Tag text="Away" tone="outline" />}
      <View style={{ flex: 1 }} />
      {trailing && <Label>{trailing}</Label>}
    </View>
  );
}

/** "15 MIN · 3 SKIPS · AI ON" with a way into the settings for the host. */
export function SettingsSummary({ settings, editable, onEdit }: { settings: GameSettings; editable: boolean; onEdit: () => void }) {
  const pal = usePalette();
  const summary = [
    formatDuration(settings.durationMinutes),
    settings.allowSkips ? `${settings.maxSkips} skips` : "no skips",
    settings.difficultyScoring !== false ? "1–5 pts" : "1 pt each",
    settings.aiRefill ? "AI on" : "AI off",
  ].join(" · ");
  return (
    <Pressable
      disabled={!editable}
      onPress={onEdit}
      accessibilityRole="button"
      style={{ flexDirection: "row", alignItems: "center", gap: space.m, padding: space.m, backgroundColor: pal.raised, borderRadius: radius.card }}
    >
      <Feather name="sliders" size={20} color={pal.fg} />
      <View style={{ flex: 1, gap: 2 }}>
        <Label size={13} bold color={pal.fg}>
          Game settings
        </Label>
        <Label size={11} numberOfLines={1}>
          {summary}
        </Label>
      </View>
      {editable && <Feather name="chevron-right" size={20} color={pal.accent} />}
    </Pressable>
  );
}

export function GameSettingsSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { state, send } = useGame();
  const s = state.settings;
  const update = (patch: Partial<GameSettings>) => send({ type: "updateSettings", settings: { ...s, ...patch } });

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <Screen title="Game settings" left={{ icon: "x", onPress: onClose, label: "Close" }} footer={<Button title="Done" onPress={onClose} />}>
        <ScrollView contentContainerStyle={{ paddingHorizontal: space.gutter, gap: space.l, paddingBottom: space.l }}>
          <View style={{ gap: space.s }}>
            <SectionLabel>Round length</SectionLabel>
            <DurationField minutes={s.durationMinutes} onChange={(m) => update({ durationMinutes: m })} />
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.s }}>
              {DURATION_OPTIONS.map((m) => (
                <Pressable
                  key={m}
                  onPress={() => update({ durationMinutes: m })}
                  accessibilityRole="button"
                  accessibilityState={{ selected: s.durationMinutes === m }}
                  accessibilityLabel={formatDuration(m)}
                  style={{
                    minWidth: 64,
                    minHeight: 44,
                    paddingHorizontal: space.m,
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: radius.pill,
                    backgroundColor: s.durationMinutes === m ? color.signalRed : "transparent",
                    borderWidth: 2,
                    borderColor: s.durationMinutes === m ? color.signalRed : color.paperLine,
                  }}
                >
                  <Display size={22} color={s.durationMinutes === m ? color.paperBright : color.inkBlack}>
                    {formatDuration(m)}
                  </Display>
                </Pressable>
              ))}
            </View>
          </View>
          <SwitchRow label="Skips allowed" value={s.allowSkips} onChange={(v) => update({ allowSkips: v })} />
          {s.allowSkips && <Stepper label="Skips per player" value={s.maxSkips} min={1} max={10} onChange={(v) => update({ maxSkips: v })} />}
          <SwitchRow
            label="Harder = more points"
            detail="AI rates each quest 1–5 on time, nerve and effort. Off: every quest is worth 1."
            value={s.difficultyScoring !== false}
            onChange={(v) => update({ difficultyScoring: v })}
          />
          <SwitchRow label="AI refills" detail="Writes new quests when the deck runs dry" value={s.aiRefill} onChange={(v) => update({ aiRefill: v })} />
          <Stepper label="AI starter quests" value={s.aiStarterCount} min={0} max={10} onChange={(v) => update({ aiStarterCount: v })} />
          <Label size={11}>{state.aiMode === "ai" ? "Quest writer: AI" : "Quest writer: offline deck (no API key on the server)"}</Label>
        </ScrollView>
      </Screen>
    </Modal>
  );
}

/** Type any number of minutes; the quick picks below fill it in. Commits on blur or return. */
function DurationField({ minutes, onChange }: { minutes: number; onChange: (m: number) => void }) {
  const [text, setText] = useState(String(minutes));
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setText(String(minutes));
  }, [minutes, focused]);
  const commit = () => {
    setFocused(false);
    const n = parseInt(text, 10);
    if (Number.isFinite(n)) {
      const m = clampDuration(n);
      setText(String(m));
      if (m !== minutes) onChange(m);
    } else setText(String(minutes));
  };
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space.m }}>
      <TextInput
        value={text}
        onChangeText={(t) => setText(t.replace(/[^0-9]/g, "").slice(0, 3))}
        onFocus={() => setFocused(true)}
        onBlur={commit}
        onSubmitEditing={commit}
        keyboardType="number-pad"
        returnKeyType="done"
        selectTextOnFocus
        accessibilityLabel="Round length in minutes"
        style={{
          width: 120,
          fontFamily: font.display,
          fontSize: 44,
          color: color.signalRed,
          backgroundColor: color.paperBright,
          borderRadius: radius.field,
          borderWidth: 2,
          borderColor: focused ? color.signalRed : color.paperLine,
          paddingHorizontal: space.m,
          paddingVertical: 4,
          textAlign: "center",
        }}
      />
      <View style={{ flex: 1, gap: 2 }}>
        <Body medium>minutes</Body>
        <Label size={10}>{`Any length, up to ${MAX_DURATION_MINUTES / 60} hours`}</Label>
      </View>
    </View>
  );
}

/** The lobby code, small, in the corner of every game screen — so a lost player can find their way back. Tap to share the invite. */
export function LobbyCode() {
  const { state } = useGame();
  const pal = usePalette();
  // Where there's no share sheet the link is copied; say so in the tag itself for a moment.
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => {
    if (!note) return;
    const t = setTimeout(() => setNote(null), 1600);
    return () => clearTimeout(t);
  }, [note]);
  return (
    <>
      <Pressable
        onPress={() => void invite(state.code, (m) => setNote(m === "Invite link copied" ? "Copied" : null))}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={`Lobby code ${state.code.split("").join(" ")}. Share the invite`}
        style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill, borderWidth: 1.5, borderColor: pal.line }}
      >
        <Label size={11} bold color={pal.fg} style={{ letterSpacing: 2 }}>
          {note ?? state.code}
        </Label>
      </Pressable>
    </>
  );
}

export function Stepper({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void }) {
  const btn = (icon: "minus" | "plus", next: number) => (
    <Pressable
      disabled={next < min || next > max}
      onPress={() => onChange(next)}
      accessibilityRole="button"
      accessibilityLabel={`${icon === "plus" ? "Increase" : "Decrease"} ${label}`}
      style={{ width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: color.signalRed, opacity: next < min || next > max ? 0.3 : 1 }}
    >
      <Feather name={icon} size={18} color={color.signalRed} />
    </Pressable>
  );
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space.s }}>
      <Body medium style={{ flex: 1 }}>
        {label}
      </Body>
      {btn("minus", value - 1)}
      <Display size={28} style={{ minWidth: 36, textAlign: "center" }}>
        {String(value)}
      </Display>
      {btn("plus", value + 1)}
    </View>
  );
}

/** Share the join link: the system share sheet where there is one, otherwise copy it. */
async function invite(code: string, notify: (m: string) => void) {
  const url = joinUrl(code);
  const message = `Join my Side Quests lobby ${code}: ${url}`;
  try {
    if (Platform.OS !== "web") {
      await Share.share({ message });
      return;
    }
    if (navigator.share) {
      await navigator.share({ title: "Side Quests", text: `Join my Side Quests lobby ${code}`, url });
      return;
    }
    await navigator.clipboard.writeText(url);
    notify("Invite link copied");
  } catch {
    notify(url);
  }
}
