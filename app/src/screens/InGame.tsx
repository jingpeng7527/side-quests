import Feather from "@expo/vector-icons/Feather";
import { claimedPoints, distance, formatDistance, newSeed, questPoints, type Coordinate, type QuestPlace, type WalkingRoute } from "@side-quests/game";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { useEffect, useRef, useState } from "react";
import { Animated, Image, Linking, Modal, Platform, Pressable, ScrollView, View, useWindowDimensions } from "react-native";
import { DEV_MENU, serverUrl } from "../lib/config";
import { useGame } from "../lib/session";
import { DevMenu } from "../ui/DevMenu";
import { fitBlock, fitLine } from "../ui/fit";
import { easeIn, useToast } from "../ui/flow";
import { Avatar, Body, Button, Card, Display, Label, PaletteProvider, Screen, SectionLabel, Tag, color, radius, space } from "../ui/kit";
import { QuestMap } from "../ui/maps";
import { PointsBadge } from "../ui/Points";
import { ProofImage } from "../ui/Proof";
import { LobbyCode } from "./Lobby";

export function InGameScreen() {
  const { state, me, myQuest, mySkipsLeft, send, location } = useGame();
  const { width } = useWindowDimensions();
  const [capturing, setCapturing] = useState(false);
  const [stamp] = useState(() => new Animated.Value(0));
  // Above the standings, clear of the quest card and the Prove it button.
  const toast = useToast({ bottom: 150 });
  const done = state.submissions.filter((s) => s.playerId === me.id).length;
  const place = myQuest?.place;
  const w = Math.min(width, 560) - space.gutter * 2;

  // A friend finishing a quest is news: a toast and a light tap.
  const seen = useRef(state.submissions.length);
  useEffect(() => {
    const fresh = state.submissions.slice(seen.current).filter((s) => s.playerId !== me.id);
    seen.current = state.submissions.length;
    const last = fresh[fresh.length - 1];
    if (!last) return;
    const name = state.players.find((p) => p.id === last.playerId)?.name ?? "Someone";
    toast.show(fresh.length > 1 ? `${fresh.length} quests just got done!` : `${name} completed a quest!`, fresh.length > 1 ? undefined : name);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  }, [state.submissions.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const celebrate = () => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    stamp.setValue(0);
    Animated.sequence([
      Animated.spring(stamp, { toValue: 1, useNativeDriver: true, speed: 18, bounciness: 10 }),
      Animated.delay(900),
      Animated.timing(stamp, { toValue: 0, duration: 220, easing: easeIn, useNativeDriver: true }),
    ]).start();
  };

  const cardWidth = w - space.m * 2 - 8;
  const questSize = myQuest ? fitBlock(myQuest.text, cardWidth, place ? 120 : 190, 58, 22) : 40;

  return (
    <Screen
      tone="signal"
      left={<LobbyCode />}
      stripes={{ corner: "tr", color: color.paperBright, bands: [[0.04, 0.05], [0.13, 0.025]] }}
      title={
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <LiveDot />
          <Label size={14} bold color={color.paperBright}>
            Live
          </Label>
        </View>
      }
      right={
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.s }}>
          {/* On a pill so it reads over the corner stripe. */}
          <View style={{ backgroundColor: color.deepRed, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 3 }}>
            <Label size={11} bold color={color.paperBright} numberOfLines={1}>
              {done} done
            </Label>
          </View>
          <DevMenu />
        </View>
      }
      footer={
        <View style={{ gap: space.s, alignItems: "center" }}>
          <Button title="Prove it" icon="camera" tilt={-2} disabled={!myQuest} onPress={() => setCapturing(true)} style={{ alignSelf: "stretch" }} />
          {state.settings.allowSkips && (
            <Pressable onPress={() => send({ type: "skip", playerId: me.id })} disabled={!mySkipsLeft || !myQuest} hitSlop={10} accessibilityRole="button" style={{ opacity: !mySkipsLeft || !myQuest ? 0.4 : 1 }}>
              <Label size={11} bold color={color.paperBright} style={{ textDecorationLine: "underline" }}>
                Skip this one · {mySkipsLeft} left
              </Label>
            </Pressable>
          )}
        </View>
      }
    >
      <ScrollView contentContainerStyle={{ paddingHorizontal: space.gutter, gap: space.m, paddingBottom: space.l }}>
        <Countdown width={w} compact={!!place} />
        {myQuest ? (
          <PaletteProvider tone="paper">
            <Card tilt={-2.5} style={{ gap: space.s, borderColor: "transparent", marginHorizontal: 4 }}>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <Label size={12} bold color={color.signalRed} style={{ textDecorationLine: "underline" }}>
                  Current quest
                </Label>
                {myQuest.source === "ai" && <Tag text="AI-written" tone="ink" />}
              </View>
              <Display size={questSize} color={color.signalRed} style={{ marginVertical: 2 }}>
                {myQuest.text}
              </Display>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <Label size={12} bold color={color.signalRed}>
                  #{done + 1}
                </Label>
                <PointsBadge points={questPoints(state, myQuest)} size="lg" />
              </View>
            </Card>
          </PaletteProvider>
        ) : (
          <Card tilt={-2} style={{ gap: space.s, borderColor: "transparent" }}>
            <Display size={52} color={color.signalRed}>
              {"Deck's dry."}
            </Display>
            <Body size={14} color={color.inkBlack}>
              {state.aiWriting ? "Writing fresh quests in your group's vibe…" : "Waiting on new quests…"}
            </Body>
          </Card>
        )}
        {place && <QuestMapCard place={place} me={location} />}
        <Standings />
      </ScrollView>
      <Animated.View
        pointerEvents="none"
        style={{
          position: "absolute",
          alignSelf: "center",
          top: "35%",
          opacity: stamp,
          transform: [{ rotate: "-8deg" }, { scale: stamp.interpolate({ inputRange: [0, 1], outputRange: [1.6, 1] }) }],
        }}
      >
        <View style={{ backgroundColor: color.inkBlack, paddingHorizontal: space.l, paddingVertical: space.m, borderRadius: radius.card }}>
          <Display size={64} fit={w * 0.8} style={{ textAlign: "center" }}>
            Quest complete!
          </Display>
        </View>
      </Animated.View>
      {toast.node}
      <CaptureSheet visible={capturing} onClose={() => setCapturing(false)} onSubmitted={celebrate} />
    </Screen>
  );
}

function LiveDot() {
  const [pulse] = useState(() => new Animated.Value(1));
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.3, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  return <Animated.View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: color.paperBright, opacity: pulse }} />;
}

/** Everyone's tally, live — avatars with scores, host marked. You first. */
function Standings() {
  const { state, me } = useGame();
  const rows = state.players
    // Points claimed so far — friends vote on them at the end.
    .map((p) => ({ p, n: claimedPoints(state, p.id) }))
    .sort((a, b) => Number(b.p.id === me.id) - Number(a.p.id === me.id) || b.n - a.n);
  return (
    <View style={{ gap: space.s }}>
      <SectionLabel>
        <Label size={13} bold color={color.paperBright}>
          Live standings
        </Label>
      </SectionLabel>
      {/* Wraps into rows with a big group, inside the screen's own vertical scroll. */}
      <View style={{ flexDirection: "row", flexWrap: "wrap", columnGap: space.m, rowGap: space.m, paddingVertical: 4 }} accessibilityLabel="Standings">
        {rows.map(({ p, n }) => {
          const away = state.away?.includes(p.id);
          return (
            <View key={p.id} style={{ alignItems: "center", gap: 4, minWidth: 56, opacity: away ? 0.5 : 1 }}>
              <View style={{ padding: 2, borderRadius: 26, backgroundColor: color.paperBright }}>
                <Avatar name={p.name} size={44} bot={p.isBot} ring={p.id === me.id} />
              </View>
              <Label size={11} bold color={color.paperBright} numberOfLines={1} style={{ maxWidth: 72, textTransform: "none" }}>
                {p.id === me.id ? "You" : p.name}
              </Label>
              {/* Same-height slot for everyone, so the scores line up. */}
              <View style={{ height: 20, justifyContent: "center" }}>{p.id === state.hostId && <Tag text="Host" tone="paper" />}</View>
              <Display size={26} skew={false}>
                {`${n}`}
              </Display>
              <Label size={9} bold color={color.paperBright}>
                pts
              </Label>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function Countdown({ width, compact }: { width: number; compact: boolean }) {
  const { state, clockOffset } = useGame();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);
  const total = state.settings.durationMinutes * 60;
  const remaining = Math.max(0, Math.floor(((state.endsAt ?? 0) - (now + clockOffset)) / 1000));
  const urgent = remaining < 60;
  // Rounds can run for hours now: past an hour the clock reads H:MM:SS.
  const two = (n: number) => String(n).padStart(2, "0");
  const hours = Math.floor(remaining / 3600);
  const text = hours ? `${hours}:${two(Math.floor(remaining / 60) % 60)}:${two(remaining % 60)}` : `${two(Math.floor(remaining / 60))}:${two(remaining % 60)}`;

  // A nudge you can feel at one minute and at ten seconds.
  const warned = useRef(new Set<number>());
  useEffect(() => {
    for (const mark of [60, 10]) {
      if (remaining <= mark && remaining > mark - 3 && !warned.current.has(mark)) {
        warned.current.add(mark);
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      }
    }
  }, [remaining]);

  // Sized for the widest digits, so the clock doesn't jump as it counts.
  const size = fitLine(hours ? `${hours}:00:00` : "00:00", width, compact ? 120 : 170);
  return (
    <View accessible accessibilityLabel={`${Math.floor(remaining / 60)} minutes ${remaining % 60} seconds left`} style={{ gap: space.s }}>
      <Display size={size} color={urgent ? color.inkBlack : color.paperBright} style={{ fontVariant: ["tabular-nums"] }}>
        {text}
      </Display>
      <View style={{ height: 6, borderRadius: 3, backgroundColor: color.deepRed, overflow: "hidden" }}>
        <View style={{ height: 6, width: `${(remaining / total) * 100}%`, backgroundColor: urgent ? color.inkBlack : color.paperBright }} />
      </View>
    </View>
  );
}

/** Where the quest is, the walk there, and whether you've arrived. */
function QuestMapCard({ place, me }: { place: QuestPlace; me: Coordinate | null }) {
  // Routes are keyed by quest spot, so a stale one never shows for a new quest.
  const key = `${place.coordinate.latitude},${place.coordinate.longitude}`;
  const [fetched, setFetched] = useState<{ key: string; route: WalkingRoute | null } | null>(null);
  const route = fetched?.key === key ? fetched.route : null;
  const hasFix = !!me;
  const away = me ? distance(me, place.coordinate) : null;
  const arrived = away != null && away <= place.radius;

  // Route once per quest, as soon as we know where you are.
  useEffect(() => {
    if (!me) return;
    let cancelled = false;
    fetch(`${serverUrl()}/api/directions?from=${me.latitude},${me.longitude}&to=${place.coordinate.latitude},${place.coordinate.longitude}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((r: WalkingRoute | null) => !cancelled && setFetched({ key, route: r }))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [key, hasFix]); // eslint-disable-line react-hooks/exhaustive-deps

  const openDirections = () => {
    const { latitude: lat, longitude: lng } = place.coordinate;
    const url =
      Platform.OS === "ios" ? `http://maps.apple.com/?daddr=${lat},${lng}&dirflg=w` : `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=walking`;
    void Linking.openURL(url);
  };

  const status = arrived ? "You're here!" : away != null ? `${formatDistance(route?.distance ?? away)}${route ? ` · ${Math.ceil(route.duration / 60)} min` : ""}` : "Finding you…";

  return (
    <PaletteProvider tone="paper">
      <View style={{ borderRadius: radius.card, overflow: "hidden", backgroundColor: color.paperBright }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.s, paddingHorizontal: space.m, paddingVertical: 10, backgroundColor: arrived ? color.inkBlack : color.paperBright }}>
          <Feather name="map-pin" size={14} color={arrived ? color.paperBright : color.signalRed} />
          <Label size={12} bold color={arrived ? color.paperBright : color.inkBlack} numberOfLines={1} style={{ flex: 1 }}>
            {place.name}
          </Label>
          <Label size={12} bold color={arrived ? color.paperBright : color.signalRed}>
            {status}
          </Label>
        </View>
        <QuestMap style={{ height: 200 }} place={place} me={me} route={route?.coordinates ?? null} arrived={arrived} />
        <Pressable
          onPress={openDirections}
          accessibilityRole="link"
          style={{ position: "absolute", right: 10, bottom: 10, flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: color.signalRed, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 8 }}
        >
          <Feather name="navigation" size={13} color={color.paperBright} />
          <Label size={11} bold color={color.paperBright}>
            Directions
          </Label>
        </Pressable>
      </View>
    </PaletteProvider>
  );
}

type Picked = { uri: string; takenAt: number };

/**
 * Camera → a preview to check → upload. Proof has to be taken in the moment,
 * so there's no picking from the photo library. In dev (and on simulators,
 * which have no camera) a generated stand-in is offered too.
 */
function CaptureSheet({ visible, onClose, onSubmitted }: { visible: boolean; onClose: () => void; onSubmitted: () => void }) {
  const { state, me, myQuest, submitProof, uploadPhoto } = useGame();
  const [picked, setPicked] = useState<Picked | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [standinSeed, setStandinSeed] = useState(newSeed);

  const close = () => {
    setPicked(null);
    setError(null);
    setUploading(false);
    onClose();
  };

  const devShots = DEV_MENU && state.devTools;

  const takePhoto = async () => {
    setError(null);
    try {
      const result = await ImagePicker.launchCameraAsync({ quality: 0.8 });
      if (!result.canceled && result.assets?.[0]) setPicked({ uri: result.assets[0].uri, takenAt: Date.now() });
    } catch {
      setError("Couldn't open the camera. Check that Side Quests is allowed to use it.");
    }
  };

  const submit = async () => {
    if (!picked) return;
    setUploading(true);
    setError(null);
    try {
      submitProof(await uploadPhoto(picked.uri), picked.takenAt);
      close();
      onSubmitted();
    } catch (e) {
      setUploading(false);
      setError(`Upload didn't go through: ${(e as Error).message}. Try again?`);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={close}>
      <Screen
        title={picked ? "Check your proof" : "Prove it"}
        left={{ icon: "x", onPress: close, label: "Close" }}
        footer={
          picked ? (
            <>
              <Button title={uploading ? "Sending…" : "Submit proof"} icon="check" disabled={uploading} onPress={submit} />
              <Button title="Retake" kind="outline" icon="rotate-ccw" size="md" disabled={uploading} onPress={() => setPicked(null)} />
            </>
          ) : (
            <>
              <Button title="Take photo" icon="camera" onPress={() => void takePhoto()} />
              {devShots && (
                <Button
                  title="Use stand-in shot (dev)"
                  kind="quiet"
                  size="md"
                  onPress={async () => {
                    await submitProof({ kind: "standin", seed: standinSeed });
                    setStandinSeed(newSeed());
                    close();
                    onSubmitted();
                  }}
                />
              )}
            </>
          )
        }
      >
        <View style={{ flex: 1, paddingHorizontal: space.gutter, gap: space.m, paddingBottom: space.s }}>
          <Body size={16} medium>
            {myQuest?.text ?? ""}
          </Body>
          {error && <Body size={13} color={color.signalRed}>{error}</Body>}
          {/* The preview fills what's left of the screen and never more — no sideways overflow. */}
          <View style={{ flex: 1, minHeight: 160, borderRadius: radius.card, overflow: "hidden", borderWidth: 3, borderColor: picked ? color.signalRed : color.paperLine, backgroundColor: color.paperRaised }}>
            {picked ? (
              <Image source={{ uri: picked.uri }} style={{ flex: 1, opacity: uploading ? 0.5 : 1 }} resizeMode="contain" />
            ) : devShots ? (
              <ProofImage proof={{ kind: "standin", seed: standinSeed }} quest={myQuest?.text ?? ""} by={me.name} large style={{ flex: 1 }} />
            ) : (
              <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: space.l, gap: space.s }}>
                <Feather name="camera" size={36} color={color.stone} />
                <Body color={color.stone} style={{ textAlign: "center" }}>
                  Snap the moment — your friends vote on whether it counts.
                </Body>
              </View>
            )}
          </View>
        </View>
      </Screen>
    </Modal>
  );
}
