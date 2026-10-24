import { CameraView, useCameraPermissions } from "expo-camera";
import { useEffect, useRef, useState, type ComponentRef } from "react";
import { Animated, Modal, Platform, TextInput, View, useWindowDimensions } from "react-native";
import { useSession } from "../lib/session";
import { Annotation } from "../ui/Annotation";
import { Body, Button, Display, Label, Screen, color, font, radius, space } from "../ui/kit";

/** Shake a field to say "this first". */
export function useNudge() {
  const [x] = useState(() => new Animated.Value(0));
  const nudge = () =>
    Animated.sequence([10, -10, 7, -7, 0].map((toValue) => Animated.timing(x, { toValue, duration: 55, useNativeDriver: true }))).start();
  return { x, nudge };
}

/** A cream, rounded text field — the reference's name input. */
export function NameField({
  value,
  onChange,
  onSubmit,
  inputRef,
  shake,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit?: () => void;
  inputRef?: React.RefObject<ComponentRef<typeof TextInput> | null>;
  shake?: Animated.Value;
}) {
  return (
    <Animated.View style={{ transform: [{ translateX: shake ?? 0 }] }}>
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={onChange}
        placeholder="e.g. Alex"
        placeholderTextColor={color.stone}
        autoCapitalize="words"
        autoCorrect={false}
        returnKeyType="go"
        onSubmitEditing={onSubmit}
        maxLength={24}
        accessibilityLabel="Your name"
        style={{
          fontFamily: font.bodyMedium,
          fontSize: 18,
          color: color.inkBlack,
          backgroundColor: color.paperBright,
          borderRadius: radius.field,
          paddingHorizontal: space.m,
          paddingVertical: 14,
        }}
      />
    </Animated.View>
  );
}

export function HomeScreen() {
  const { me, setName, createLobby, connecting, error } = useSession();
  const { width } = useWindowDimensions();
  // null until edited, so the saved name shows once it loads.
  const [draft, setDraft] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [needName, setNeedName] = useState(false);
  const input = useRef<ComponentRef<typeof TextInput>>(null);
  const { x, nudge } = useNudge();
  const name = (draft ?? me.name).trim();
  const w = Math.min(width, 520);

  /** Buttons are never dead: without a name, they point at the field. */
  const withName = (go: () => void) => () => {
    if (!name) {
      setNeedName(true);
      nudge();
      input.current?.focus();
      return;
    }
    setNeedName(false);
    setName(name);
    go();
  };

  return (
    <Screen
      tone="signal"
      // One bold racing stripe through the empty middle, clear of the wordmark and the field.
      stripes={{ corner: "br", color: color.paperBright, bands: [[0.62, 0.11], [0.8, 0.04]], angle: 24 }}
      footer={
        <>
          {error && (
            <View accessibilityLiveRegion="polite" style={{ backgroundColor: color.inkBlack, padding: space.m, borderRadius: radius.field }}>
              <Body size={13} color={color.paperBright}>
                {error}
              </Body>
            </View>
          )}
          <Button title={connecting ? "Creating…" : "Host a lobby"} arrow disabled={connecting} onPress={withName(() => void createLobby())} />
          <Button title="Join a lobby" kind="outline" arrow onPress={withName(() => setJoining(true))} />
        </>
      }
    >
      <View style={{ flex: 1, justifyContent: "space-between" }}>
        {/* Wordmark: huge, slanted, tilted, bleeding off the left edge. */}
        <View style={{ marginTop: space.m, marginLeft: -w * 0.04, transform: [{ rotate: "-8deg" }] }}>
          <Display size={200} fit={w * 0.78}>
            Side
          </Display>
          <Display size={200} fit={w * 1.02} style={{ marginTop: -w * 0.07 }}>
            Quests
          </Display>
        </View>
        <Annotation
          lines={["Dares.", "Friends.", "Proof."]}
          color={color.paperBright}
          size={22}
          rotate={-10}
          style={{ position: "absolute", right: space.gutter, top: space.m }}
        />
        <View style={{ gap: space.s, paddingHorizontal: space.gutter, marginBottom: space.s }}>
          <Label size={12} bold color={color.paperBright}>
            {needName && !name ? "Add your name first" : "Your name"}
          </Label>
          <NameField inputRef={input} value={draft ?? me.name} onChange={setDraft} shake={x} />
        </View>
      </View>
      <JoinSheet visible={joining} onClose={() => setJoining(false)} />
    </Screen>
  );
}

/** Join by scanning the host's QR code, or by typing the lobby code. */
function JoinSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { joinLobby, error, state, connecting } = useSession();
  const { width } = useWindowDimensions();
  const [code, setCode] = useState("");
  const [scanning, setScanning] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  useEffect(() => {
    if (state) onClose();
  }, [state, onClose]);

  const onScanned = (data: string) => {
    // QR payload: https://…/join/ABCD (or anything ending in the code)
    const match = data.match(/([A-Z]{4})\/?$/i);
    if (match) {
      setScanning(false);
      void joinLobby(match[1]);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <Screen
        title="Join a lobby"
        left={{ icon: "x", onPress: onClose, label: "Close" }}
        footer={<Button title={connecting ? "Joining…" : "Join"} arrow disabled={code.length !== 4 || connecting} onPress={() => void joinLobby(code)} />}
      >
        <View style={{ paddingHorizontal: space.gutter, gap: space.l }}>
          <View style={{ height: 220, backgroundColor: color.inkBlack, borderRadius: radius.card, alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
            {scanning && permission?.granted ? (
              <CameraView style={{ width: "100%", height: "100%" }} facing="back" barcodeScannerSettings={{ barcodeTypes: ["qr"] }} onBarcodeScanned={(r) => onScanned(r.data)} />
            ) : (
              <Button
                title="Scan QR code"
                icon="camera"
                size="md"
                onPress={async () => {
                  if (!permission?.granted) {
                    const res = await requestPermission();
                    if (!res.granted) return;
                  }
                  setScanning(true);
                }}
              />
            )}
          </View>
          <View style={{ gap: space.s }}>
            <Label size={12} bold color={color.inkBlack}>
              Or type the code
            </Label>
            <TextInput
              value={code}
              onChangeText={(t) => setCode(t.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 4))}
              placeholder="ABCD"
              placeholderTextColor={color.paperLine}
              autoCapitalize="characters"
              autoCorrect={false}
              accessibilityLabel="Lobby code"
              style={{
                fontFamily: font.display,
                fontSize: Math.min(96, (Math.min(width, 520) - space.gutter * 2) / 3.6),
                letterSpacing: 6,
                color: color.signalRed,
                backgroundColor: color.paperBright,
                borderRadius: radius.card,
                paddingHorizontal: space.m,
                paddingVertical: space.s,
                transform: [{ skewX: "-9deg" }],
              }}
            />
            {error && <Body size={13} color={color.signalRed}>{error}</Body>}
            {Platform.OS === "web" && (
              <Body size={13} color={color.stone}>
                On a laptop? Type the code — scanning works best on a phone.
              </Body>
            )}
          </View>
        </View>
      </Screen>
    </Modal>
  );
}
