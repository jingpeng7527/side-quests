import { NEXT_PHASE, readiness, type Phase } from "@side-quests/game";
import * as Haptics from "expo-haptics";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { AccessibilityInfo, Animated, Easing, Modal, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useGame, useSession } from "../lib/session";
import { Body, Display, Label, PaletteProvider, SlabButton, WaitingBar, color, space } from "./kit";

// Motion: one family — expo-out for entrances, quicker ease-in for exits.
export const easeOut = Easing.bezier(0.22, 1, 0.36, 1);
export const easeIn = Easing.bezier(0.55, 0, 1, 0.45);

export function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduced);
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduced);
    return () => sub.remove();
  }, []);
  return reduced;
}

const PHASE_NAMES: Record<Phase, string> = {
  lobby: "the lobby",
  writing: "writing quests",
  review: "deck review",
  playing: "the game",
  ended: "game over",
  verifying: "verification",
  scoreboard: "final scores",
};

/** Each phase screen rises in instead of hard-cutting, so a phase change reads as a change. */
export function PhaseEntrance({ children }: { children: ReactNode }) {
  const reduced = useReducedMotion();
  const [t] = useState(() => new Animated.Value(0));
  useEffect(() => {
    Animated.timing(t, { toValue: 1, duration: 360, easing: easeOut, useNativeDriver: true }).start();
  }, [t]);
  return (
    <Animated.View
      style={{
        flex: 1,
        opacity: t,
        transform: reduced ? [] : [{ translateY: t.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }],
      }}
    >
      {children}
    </Animated.View>
  );
}

/**
 * "WRITING QUESTS IN 3" — everyone gets a few seconds' warning before the host
 * moves the game on, and the host can call it off.
 */
export function TransitionBanner() {
  const { state, isHost, send, clockOffset } = useSession();
  const insets = useSafeAreaInsets();
  const transition = state?.transition;
  const [now, setNow] = useState(() => Date.now());
  const [slide] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (!transition) return;
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
    const t = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(t);
  }, [transition?.at]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    Animated.timing(slide, { toValue: transition ? 1 : 0, duration: transition ? 280 : 180, easing: transition ? easeOut : easeIn, useNativeDriver: true }).start();
  }, [!!transition]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!state) return null;
  const host = state.players.find((p) => p.id === state.hostId)?.name ?? "The host";
  const secs = transition ? Math.max(0, Math.ceil((transition.at - (now + clockOffset)) / 1000)) : 0;

  return (
    <Animated.View
      pointerEvents={transition ? "auto" : "none"}
      accessibilityLiveRegion="polite"
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        paddingTop: insets.top + space.s,
        paddingBottom: space.m,
        paddingHorizontal: space.gutter,
        backgroundColor: color.inkBlack,
        flexDirection: "row",
        alignItems: "center",
        gap: space.m,
        opacity: slide,
        transform: [{ translateY: slide.interpolate({ inputRange: [0, 1], outputRange: [-40, 0] }) }],
      }}
    >
      <Display size={56} color={color.signalRed} style={{ minWidth: 36, fontVariant: ["tabular-nums"] }}>
        {String(secs)}
      </Display>
      <View style={{ flex: 1 }}>
        <Label size={11} color={color.paperBright}>
          Moving to {transition ? PHASE_NAMES[transition.to] : ""}
        </Label>
        <Body size={14} color={color.paperBright} style={{ opacity: 0.8 }}>
          {isHost ? "Everyone's getting a heads-up." : `${host} is moving the game on.`}
        </Body>
      </View>
      {isHost && (
        <Pressable onPress={() => send({ type: "cancelTransition" })} hitSlop={8} style={{ borderWidth: 2, borderColor: color.paperBright, paddingHorizontal: 12, paddingVertical: 8 }}>
          <Label size={12} color={color.paperBright}>
            Wait
          </Label>
        </Pressable>
      )}
    </Animated.View>
  );
}

/** Shown while the link to the lobby is down. */
export function ConnectionBanner() {
  const { state, connected } = useSession();
  const insets = useSafeAreaInsets();
  if (!state || connected) return null;
  return (
    <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, paddingBottom: insets.bottom + space.s, paddingTop: space.s, backgroundColor: color.inkBlack, alignItems: "center" }} accessibilityLiveRegion="polite">
      <Label size={11} color={color.paperBright}>
        Reconnecting…
      </Label>
    </View>
  );
}

/** A bottom sheet asking to confirm something consequential. */
export function ConfirmSheet({
  visible,
  title,
  body,
  confirm,
  onConfirm,
  onCancel,
}: {
  visible: boolean;
  title: string;
  body: string;
  confirm: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <PaletteProvider tone="paper">
        <Pressable style={{ flex: 1, backgroundColor: "rgba(23,17,15,0.55)", justifyContent: "flex-end" }} onPress={onCancel}>
          <Pressable style={{ backgroundColor: color.paper, padding: space.gutter, paddingBottom: insets.bottom + space.m, gap: space.m }}>
            <Display size={40}>{title}</Display>
            <Body color={color.stone}>{body}</Body>
            <View style={{ gap: space.s, marginTop: space.s }}>
              <SlabButton title={confirm} onPress={onConfirm} />
              <SlabButton title="Not yet" kind="quiet" onPress={onCancel} />
            </View>
          </Pressable>
        </Pressable>
      </PaletteProvider>
    </Modal>
  );
}

/**
 * The host's "move on" button. Shows who's done; if anyone isn't, asks first.
 * While a move is pending it says so instead of double-firing.
 */
export function HostAdvance({ title, disabled, waitingVerb }: { title: string; disabled?: boolean; waitingVerb?: string }) {
  const { state, send, me } = useGame();
  const [confirming, setConfirming] = useState(false);
  const to = NEXT_PHASE[state.phase];
  const { waiting, ready } = readiness(state);
  // The host moving on is the host's own "ready". Players who've dropped off don't count.
  const others = waiting.filter((p) => p.id !== me.id);
  const tracksReady = !!waitingVerb;
  // Count everyone but the host — the host moving on is their own "done".
  const total = waiting.length + ready.length - 1;
  const go = () => {
    setConfirming(false);
    if (to) send({ type: "requestPhase", phase: to });
  };

  if (state.transition) return <SlabButton title="Moving on…" disabled onPress={() => {}} />;
  return (
    <>
      <SlabButton title={title} disabled={disabled || !to} onPress={() => (tracksReady && others.length ? setConfirming(true) : go())} />
      {tracksReady && (
        <Label size={10} style={{ textAlign: "center" }}>
          {total - others.length} of {total} {total === 1 ? "player" : "players"} done {waitingVerb}
        </Label>
      )}
      <ConfirmSheet
        visible={confirming}
        title="Not everyone's done"
        body={`${listNames(others.map((p) => p.name))} ${others.length === 1 ? "is" : "are"} still ${waitingVerb}. They'll get a 3-second heads-up.`}
        confirm="Move on anyway"
        onConfirm={go}
        onCancel={() => setConfirming(false)}
      />
    </>
  );
}

/** A player's "I'm done" toggle for phases the host waits on. */
export function ReadyToggle({ doneLabel, notDoneLabel }: { doneLabel: string; notDoneLabel: string }) {
  const { state, me, send } = useGame();
  const ready = !!state.ready[me.id];
  const { ready: done, waiting } = readiness(state);
  return (
    <View style={{ gap: space.xs }}>
      <SlabButton
        title={ready ? notDoneLabel : doneLabel}
        kind={ready ? "outline" : "primary"}
        onPress={() => {
          void Haptics.selectionAsync().catch(() => {});
          send({ type: "setReady", playerId: me.id, ready: !ready });
        }}
      />
      <Label size={10} style={{ textAlign: "center" }}>
        {done.length} of {done.length + waiting.length} done · the host moves everyone on
      </Label>
    </View>
  );
}

export function listNames(names: string[]): string {
  if (names.length <= 2) return names.join(" and ");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** A transient one-line toast that rises from the bottom. */
export function useToast() {
  const [message, setMessage] = useState<string | null>(null);
  const [t] = useState(() => new Animated.Value(0));
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = (m: string) => {
    setMessage(m);
    if (timer.current) clearTimeout(timer.current);
    Animated.timing(t, { toValue: 1, duration: 260, easing: easeOut, useNativeDriver: true }).start();
    timer.current = setTimeout(() => Animated.timing(t, { toValue: 0, duration: 200, easing: easeIn, useNativeDriver: true }).start(), 2600);
  };
  const node = (
    <Animated.View
      pointerEvents="none"
      accessibilityLiveRegion="polite"
      style={{
        position: "absolute",
        left: space.gutter,
        right: space.gutter,
        bottom: 96,
        opacity: t,
        transform: [{ translateY: t.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }],
      }}
    >
      <View style={{ alignSelf: "center", backgroundColor: color.inkBlack, paddingHorizontal: space.m, paddingVertical: 10 }}>
        <Label size={12} color={color.paperBright}>
          {message ?? ""}
        </Label>
      </View>
    </Animated.View>
  );
  return { show, node };
}

/** Rises in after `index × 70ms` — for lists that should land one by one (the scoreboard). */
export function Reveal({ index, children }: { index: number; children: ReactNode }) {
  const reduced = useReducedMotion();
  const [t] = useState(() => new Animated.Value(0));
  useEffect(() => {
    Animated.timing(t, { toValue: 1, duration: 420, delay: 250 + index * 70, easing: easeOut, useNativeDriver: true }).start();
  }, [t, index]);
  return (
    <Animated.View style={{ opacity: t, transform: reduced ? [] : [{ translateY: t.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }] }}>
      {children}
    </Animated.View>
  );
}

/** Secondary actions (leave, add a bot): small mono links, so they never compete with the main button. */
export function TextAction({ title, onPress }: { title: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={12} accessibilityRole="button" style={{ alignSelf: "center", paddingVertical: space.xs }}>
      <Label size={11}>{title}</Label>
    </Pressable>
  );
}

/** "Waiting for the host…" — or, if the host's phone has dropped off, says so instead of waiting silently. */
export function HostWaitingBar({ text }: { text: string }) {
  const { state } = useGame();
  const hostAway = state.away?.includes(state.hostId);
  const host = state.players.find((p) => p.id === state.hostId)?.name ?? "The host";
  return <WaitingBar text={hostAway ? `${host}'s phone dropped off — hang tight` : text} />;
}
