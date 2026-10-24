import { distance, formatDistance, newSeed, type Coordinate, type QuestPlace, type WalkingRoute } from "@side-quests/game";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { useEffect, useRef, useState } from "react";
import { Animated, Image, Linking, Modal, Platform, Pressable, ScrollView, View } from "react-native";
import { serverUrl } from "../lib/config";
import { useGame } from "../lib/session";
import { DevMenu } from "../ui/DevMenu";
import { easeIn, useToast } from "../ui/flow";
import { halftones } from "../ui/Halftone";
import { Body, Display, Label, PaletteProvider, Screen, SlabButton, Tag, color, space } from "../ui/kit";
import { QuestMap } from "../ui/maps";
import { ProofImage } from "../ui/Proof";

export function InGameScreen() {
  const { state, me, myQuest, mySkipsLeft, send, location } = useGame();
  const [capturing, setCapturing] = useState(false);
  const [stamp] = useState(() => new Animated.Value(0));
  const toast = useToast();
  const done = state.submissions.filter((s) => s.playerId === me.id).length;
  const place = myQuest?.place;

  // A friend finishing a quest is news: a toast and a light tap.
  const seen = useRef(state.submissions.length);
  useEffect(() => {
    const fresh = state.submissions.slice(seen.current).filter((s) => s.playerId !== me.id);
    seen.current = state.submissions.length;
    const last = fresh[fresh.length - 1];
    if (!last) return;
    const name = state.players.find((p) => p.id === last.playerId)?.name ?? "Someone";
    toast.show(fresh.length > 1 ? `${fresh.length} quests just got done` : `${name} completed a quest`);
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

  return (
    <Screen
      index="04"
      title="In game"
      trailing={`${done} done`}
      tone="signal"
      art={halftones.inGame}
      accessory={<DevMenu />}
      footer={
        <View style={{ gap: space.s }}>
          <Standings />
          <View style={{ flexDirection: "row", gap: space.s }}>
            <SlabButton
              title={`Skip · ${mySkipsLeft}`}
              kind="outline"
              style={{ width: 128 }}
              disabled={!mySkipsLeft || !myQuest}
              onPress={() => send({ type: "skip", playerId: me.id })}
            />
            <SlabButton title="◉ Snap proof" style={{ flex: 1 }} disabled={!myQuest} onPress={() => setCapturing(true)} />
          </View>
        </View>
      }
    >
      <View style={{ flex: 1, paddingHorizontal: space.gutter, gap: space.m }}>
        <Countdown compact={!!place} />
        {myQuest ? (
          <View style={{ flex: 1, gap: space.m }}>
            <View style={{ flexDirection: "row", gap: space.s }}>
              <Tag text="Your quest" filled />
              {myQuest.source === "ai" && <Tag text="AI-written" />}
            </View>
            <Display size={place ? 52 : 74} adjustsFontSizeToFit minimumFontScale={0.4} style={{ flexShrink: 1 }}>
              {myQuest.text}
            </Display>
            {place && <QuestMapCard place={place} me={location} />}
          </View>
        ) : (
          <View style={{ gap: space.m, marginTop: space.l }}>
            <Display size={74}>{"Deck's dry."}</Display>
            <Body>{state.aiWriting ? "Writing fresh quests in your group's vibe…" : "Waiting on new quests…"}</Body>
          </View>
        )}
        <Animated.View
          pointerEvents="none"
          style={{
            position: "absolute",
            alignSelf: "center",
            top: "40%",
            opacity: stamp,
            transform: [{ rotate: "-7deg" }, { scale: stamp.interpolate({ inputRange: [0, 1], outputRange: [1.6, 1] }) }],
          }}
        >
          <View style={{ backgroundColor: color.inkBlack, paddingHorizontal: space.l, paddingVertical: space.m }}>
            <Display size={76} style={{ textAlign: "center" }}>
              {"Quest\ncomplete"}
            </Display>
          </View>
        </Animated.View>
      </View>
      {toast.node}
      <CaptureSheet visible={capturing} onClose={() => setCapturing(false)} onSubmitted={celebrate} />
    </Screen>
  );
}

/** Everyone's tally, live — so the race feels like a race. You first, then by score. */
function Standings() {
  const { state, me } = useGame();
  const counts = state.players
    .map((p) => ({ p, n: state.submissions.filter((s) => s.playerId === p.id).length }))
    .sort((a, b) => Number(b.p.id === me.id) - Number(a.p.id === me.id) || b.n - a.n);
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.m }} accessibilityLabel="Standings">
      {counts.map(({ p, n }) => (
        <View key={p.id} style={{ flexDirection: "row", alignItems: "baseline", gap: 6, opacity: state.away?.includes(p.id) ? 0.5 : 1 }}>
          <Label size={11} color={color.paperBright} style={{ opacity: p.id === me.id ? 1 : 0.85 }}>
            {p.id === me.id ? "You" : p.name}
          </Label>
          <Display size={22}>{String(n)}</Display>
        </View>
      ))}
    </ScrollView>
  );
}

function Countdown({ compact }: { compact: boolean }) {
  const { state, clockOffset } = useGame();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, []);
  const total = state.settings.durationMinutes * 60;
  const remaining = Math.max(0, Math.floor(((state.endsAt ?? 0) - (now + clockOffset)) / 1000));
  const urgent = remaining < 60;
  const text = `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")}`;

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

  return (
    <View accessible accessibilityLabel={`${Math.floor(remaining / 60)} minutes ${remaining % 60} seconds left`} style={{ gap: space.s }}>
      <Display size={compact ? 92 : 136} color={urgent ? color.inkBlack : color.paperBright} style={{ fontVariant: ["tabular-nums"] }}>
        {text}
      </Display>
      <View style={{ height: 4, backgroundColor: color.deepRed }}>
        <View style={{ height: 4, width: `${(remaining / total) * 100}%`, backgroundColor: urgent ? color.inkBlack : color.paperBright }} />
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
      Platform.OS === "ios"
        ? `http://maps.apple.com/?daddr=${lat},${lng}&dirflg=w`
        : `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=walking`;
    void Linking.openURL(url);
  };

  const status = arrived
    ? "You're here"
    : away != null
      ? `${formatDistance(route?.distance ?? away)}${route ? ` · ${Math.ceil(route.duration / 60)} min` : ""}`
      : "";

  return (
    <PaletteProvider tone="paper">
      <View style={{ flex: 1, minHeight: 180, maxHeight: 300, borderWidth: 3, borderColor: color.paperBright }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.s, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: arrived ? color.inkBlack : color.paperBright }}>
          <Label size={12} color={arrived ? color.paperBright : color.inkBlack} numberOfLines={1} style={{ flex: 1 }}>
            ⌖ {place.name}
          </Label>
          <Label size={12} color={arrived ? color.paperBright : color.inkBlack}>
            {status}
          </Label>
        </View>
        <QuestMap style={{ flex: 1 }} place={place} me={me} route={route?.coordinates ?? null} arrived={arrived} />
        <Pressable onPress={openDirections} style={{ position: "absolute", right: 8, bottom: 8, backgroundColor: color.signalRed, paddingHorizontal: 10, paddingVertical: 8 }}>
          <Label size={11} color={color.paperBright}>
            Directions ↗
          </Label>
        </Pressable>
      </View>
    </PaletteProvider>
  );
}

type Picked = { uri: string; takenAt: number };

/**
 * Camera or library → a preview to check → upload. In dev (and on simulators,
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

  const pick = async (from: "camera" | "library") => {
    setError(null);
    try {
      const result =
        from === "camera"
          ? await ImagePicker.launchCameraAsync({ quality: 0.8 })
          : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.8 });
      if (!result.canceled && result.assets?.[0]) setPicked({ uri: result.assets[0].uri, takenAt: Date.now() });
    } catch {
      setError(from === "camera" ? "No camera here — choose from your library instead." : "Couldn't open your photos.");
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
        index="◉"
        title={picked ? "Check your proof" : "Proof"}
        footer={
          picked ? (
            <>
              <SlabButton title={uploading ? "Sending…" : "Submit proof"} disabled={uploading} onPress={submit} />
              <SlabButton title="Retake" kind="outline" disabled={uploading} onPress={() => setPicked(null)} />
            </>
          ) : (
            <>
              <SlabButton title="Take photo" onPress={() => pick("camera")} />
              <SlabButton title="Choose from library" kind="outline" onPress={() => pick("library")} />
              {state.devTools && (
                <SlabButton
                  title="Use stand-in shot (dev)"
                  kind="outline"
                  onPress={() => {
                    submitProof({ kind: "standin", seed: standinSeed });
                    setStandinSeed(newSeed());
                    close();
                    onSubmitted();
                  }}
                />
              )}
              <SlabButton title="Cancel" kind="quiet" onPress={close} />
            </>
          )
        }
      >
        <View style={{ flex: 1, paddingHorizontal: space.gutter, gap: space.m }}>
          <Display size={34}>{myQuest?.text ?? ""}</Display>
          {error && <Body size={15} color={color.signalRed}>{error}</Body>}
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
            {picked ? (
              <View style={{ height: "100%", maxWidth: "100%", aspectRatio: 3 / 4, overflow: "hidden", opacity: uploading ? 0.5 : 1 }}>
                <Image source={{ uri: picked.uri }} style={{ flex: 1 }} resizeMode="cover" />
              </View>
            ) : state.devTools ? (
              <ProofImage proof={{ kind: "standin", seed: standinSeed }} quest={myQuest?.text ?? ""} by={me.name} large style={{ height: "100%", aspectRatio: 3 / 4 }} />
            ) : (
              <Body color={color.stone} style={{ textAlign: "center" }}>
                Snap the moment — your friends vote on whether it counts.
              </Body>
            )}
          </View>
        </View>
      </Screen>
    </Modal>
  );
}
