import { distance, formatDistance, newSeed, type Coordinate, type QuestPlace, type WalkingRoute } from "@side-quests/game";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { useEffect, useState } from "react";
import { Animated, Linking, Modal, Platform, Pressable, View } from "react-native";
import { serverUrl } from "../lib/config";
import { useGame } from "../lib/session";
import { DevMenu } from "../ui/DevMenu";
import { halftones } from "../ui/Halftone";
import { Body, Display, Label, PaletteProvider, Screen, SlabButton, Tag, color, space } from "../ui/kit";
import { QuestMap } from "../ui/maps";
import { ProofImage } from "../ui/Proof";

export function InGameScreen() {
  const { state, me, myQuest, mySkipsLeft, send, location } = useGame();
  const [capturing, setCapturing] = useState(false);
  const [stamp] = useState(() => new Animated.Value(0));
  const done = state.submissions.filter((s) => s.playerId === me.id).length;
  const place = myQuest?.place;

  const celebrate = () => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    stamp.setValue(0);
    Animated.sequence([
      Animated.spring(stamp, { toValue: 1, useNativeDriver: true, speed: 18, bounciness: 10 }),
      Animated.delay(900),
      Animated.timing(stamp, { toValue: 0, duration: 250, useNativeDriver: true }),
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
      <CaptureSheet visible={capturing} onClose={() => setCapturing(false)} onSubmitted={celebrate} />
    </Screen>
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

/** Camera, library, or — on simulators and in dev — a generated stand-in. */
function CaptureSheet({ visible, onClose, onSubmitted }: { visible: boolean; onClose: () => void; onSubmitted: () => void }) {
  const { state, me, myQuest, submitProof, uploadPhoto } = useGame();
  const [busy, setBusy] = useState<string | null>(null);
  const [standinSeed, setStandinSeed] = useState(newSeed);

  const finish = async (pick: () => Promise<ImagePicker.ImagePickerResult>) => {
    try {
      const result = await pick();
      if (result.canceled || !result.assets?.[0]) return;
      setBusy("Uploading…");
      submitProof(await uploadPhoto(result.assets[0].uri));
      onClose();
      onSubmitted();
    } catch (e) {
      setBusy(`Couldn't use that photo: ${(e as Error).message}`);
      return;
    }
    setBusy(null);
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <Screen
        index="◉"
        title="Proof"
        footer={
          <>
            <SlabButton title="Take photo" onPress={() => finish(() => ImagePicker.launchCameraAsync({ quality: 0.8 }))} />
            <SlabButton title="Choose from library" kind="outline" onPress={() => finish(() => ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.8 }))} />
            {state.devTools && (
              <SlabButton
                title="Use stand-in shot (dev)"
                kind="outline"
                onPress={() => {
                  submitProof({ kind: "standin", seed: standinSeed });
                  setStandinSeed(newSeed());
                  onClose();
                  onSubmitted();
                }}
              />
            )}
            <SlabButton title="Cancel" kind="quiet" onPress={onClose} />
          </>
        }
      >
        <View style={{ flex: 1, paddingHorizontal: space.gutter, gap: space.m }}>
          <Display size={36}>{myQuest?.text ?? ""}</Display>
          {busy && <Label color={color.signalRed}>{busy}</Label>}
          {state.devTools && (
            <View style={{ flex: 1, alignItems: "center" }}>
              <ProofImage proof={{ kind: "standin", seed: standinSeed }} quest={myQuest?.text ?? ""} by={me.name} large style={{ height: "100%", aspectRatio: 3 / 4 }} />
            </View>
          )}
        </View>
      </Screen>
    </Modal>
  );
}
