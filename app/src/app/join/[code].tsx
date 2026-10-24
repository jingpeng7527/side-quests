import { Redirect, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { TextInput, View } from "react-native";
import { useSession } from "../../lib/session";
import { halftones } from "../../ui/Halftone";
import { Body, Display, Hairline, Label, Screen, SlabButton, color, font, space } from "../../ui/kit";

/**
 * Where a scanned invite lands: `/join/ABCD`. Opens in any phone browser (the
 * game server serves the web app), so friends need no install and no account —
 * just a name.
 */
export default function JoinLink() {
  const { code: raw } = useLocalSearchParams<{ code: string }>();
  const code = (raw ?? "").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 4);
  const { me, setName, joinLobby, state, error } = useSession();
  const [draft, setDraft] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const name = (draft ?? me.name).trim();

  // In (or already in) the lobby: the game lives on the main screen.
  if (state) return <Redirect href="/" />;

  const join = async () => {
    setName(name);
    setJoining(true);
    // Let the name land before saying hello to the lobby.
    await new Promise((r) => setTimeout(r, 50));
    await joinLobby(code);
    setJoining(false);
  };

  return (
    <Screen
      index="01"
      title="You're invited"
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
          <SlabButton title={joining ? "Joining…" : `Join ${code}`} disabled={!name || code.length !== 4 || joining} onPress={join} />
        </>
      }
    >
      <View style={{ flex: 1, paddingHorizontal: space.gutter, justifyContent: "space-between" }}>
        <View style={{ marginTop: space.l, gap: space.s }}>
          <Label size={11}>Lobby</Label>
          <Display size={150} style={{ letterSpacing: 4 }}>
            {code || "????"}
          </Display>
          <Body style={{ maxWidth: 300 }}>
            Friends write dares, you get dealt theirs, and you prove each one with a photo before the clock runs out.
          </Body>
        </View>
        <View style={{ gap: space.s, marginBottom: space.m }}>
          <Label size={11}>Your name</Label>
          <TextInput
            value={draft ?? me.name}
            onChangeText={setDraft}
            placeholder="Who's playing?"
            placeholderTextColor="rgba(255,250,246,0.55)"
            autoCapitalize="words"
            autoCorrect={false}
            autoFocus={!me.name}
            returnKeyType="go"
            onSubmitEditing={() => name && void join()}
            style={{ fontFamily: font.display, fontSize: 48, color: color.paperBright, paddingVertical: 4 }}
          />
          <Hairline emphasized />
        </View>
      </View>
    </Screen>
  );
}
