import { CameraView, useCameraPermissions } from "expo-camera";
import { useEffect, useState } from "react";
import { Modal, Platform, Text, TextInput, View, useWindowDimensions } from "react-native";
import { useSession } from "../lib/session";
import { halftones } from "../ui/Halftone";
import { Body, Display, Hairline, Label, Screen, SlabButton, color, font, space } from "../ui/kit";

export function HomeScreen() {
  const { me, setName, createLobby, connecting, error } = useSession();
  const { width } = useWindowDimensions();
  const markWidth = Math.min(width, 600) - space.gutter * 2;
  // null until edited, so the saved name shows once it loads.
  const [draft, setDraft] = useState<string | null>(null);
  const name = draft ?? me.name;
  const [focused, setFocused] = useState(false);
  const [joining, setJoining] = useState(false);
  const trimmed = name.trim();

  return (
    <Screen
      index="00"
      title="Side Quests"
      tone="signal"
      art={halftones.home}
      footer={
        <>
          {error && (
            <View accessibilityLiveRegion="polite" style={{ backgroundColor: color.inkBlack, padding: space.m }}>
              <Body size={14} color={color.paperBright}>
                {error}
              </Body>
            </View>
          )}
          <SlabButton
            title={connecting ? "Creating…" : "Create lobby"}
            disabled={!trimmed || connecting}
            onPress={() => {
              setName(trimmed);
              void createLobby();
            }}
          />
          <SlabButton
            title="Join a lobby"
            kind="outline"
            disabled={!trimmed}
            onPress={() => {
              setName(trimmed);
              setJoining(true);
            }}
          />
        </>
      }
    >
      <View style={{ flex: 1, paddingHorizontal: space.gutter, justifyContent: "space-between" }}>
        <View style={{ marginTop: space.xl }}>
          {/* Wordmark: white over the red field, the second word in ink. */}
          <Display size={150} fit={markWidth}>
            Side
          </Display>
          <Display size={150} fit={markWidth} color={color.inkBlack} style={{ marginTop: -30 }}>
            Quests
          </Display>
          <Body style={{ maxWidth: 300, marginTop: space.m }}>
            Write dares for your friends. Get dealt theirs. Prove it with a photo before the clock runs out.
          </Body>
        </View>
        <View style={{ gap: space.s, marginBottom: space.m }}>
          <Label size={11}>Your name</Label>
          <TextInput
            value={name}
            onChangeText={setDraft}
            placeholder="Who's playing?"
            placeholderTextColor="rgba(255,250,246,0.55)"
            autoCapitalize="words"
            autoCorrect={false}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            style={{ fontFamily: font.display, fontSize: 48, color: color.paperBright, paddingVertical: 4 }}
          />
          <Hairline emphasized={focused} />
        </View>
      </View>
      <JoinSheet visible={joining} onClose={() => setJoining(false)} />
    </Screen>
  );
}

/** Join by scanning the host's QR code, or by typing the lobby code. */
function JoinSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { joinLobby, error, state } = useSession();
  const [code, setCode] = useState("");
  const [scanning, setScanning] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  useEffect(() => {
    if (state) onClose();
  }, [state, onClose]);

  const onScanned = (data: string) => {
    // QR payload: sidequests://join/ABCD (or any URL ending in the code)
    const match = data.match(/([A-Z]{4})\/?$/i);
    if (match) {
      setScanning(false);
      void joinLobby(match[1]);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <Screen
        index="01"
        title="Join a lobby"
        footer={
          <>
            <SlabButton title="Join" disabled={code.trim().length !== 4} onPress={() => void joinLobby(code)} />
            <SlabButton title="Cancel" kind="quiet" onPress={onClose} />
          </>
        }
      >
        <View style={{ paddingHorizontal: space.gutter, gap: space.l }}>
          <Display size={44}>{"Scan the host's code, or type it in."}</Display>

          <View style={{ height: 240, backgroundColor: color.inkBlack, alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
            {scanning && permission?.granted ? (
              <CameraView
                style={{ width: "100%", height: "100%" }}
                facing="back"
                barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
                onBarcodeScanned={(r) => onScanned(r.data)}
              />
            ) : (
              <SlabButton
                title="Scan QR code"
                style={{ width: 220 }}
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
            <Label size={11}>Lobby code</Label>
            <TextInput
              value={code}
              onChangeText={(t) => setCode(t.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 4))}
              placeholder="ABCD"
              placeholderTextColor={color.paperLine}
              autoCapitalize="characters"
              autoCorrect={false}
              style={{ fontFamily: font.display, fontSize: 96, letterSpacing: 6, color: color.signalRed, paddingVertical: 0 }}
            />
            <Hairline emphasized />
            {error && <Text style={{ color: color.signalRed, fontFamily: font.mono }}>{error}</Text>}
            {Platform.OS === "web" && <Body size={13} color={color.stone}>On a laptop? Type the code — scanning works best on a phone.</Body>}
          </View>
        </View>
      </Screen>
    </Modal>
  );
}
