import { Redirect, useLocalSearchParams } from "expo-router";
import { useRef, useState } from "react";
import { View, useWindowDimensions, type TextInput } from "react-native";
import type { ComponentRef } from "react";
import { useSession } from "../../lib/session";
import { NameField, useNudge } from "../../screens/Home";
import { Annotation } from "../../ui/Annotation";
import { Body, Button, Display, Label, Screen, color, radius, space } from "../../ui/kit";

/**
 * Where a scanned invite lands: `/join/ABCD`. Opens in any phone browser (the
 * game server serves the web app), so friends need no install and no account —
 * just a name.
 */
export default function JoinLink() {
  const { code: raw } = useLocalSearchParams<{ code: string }>();
  const code = (raw ?? "").toUpperCase().replace(/[^A-Z]/g, "").slice(0, 4);
  const { me, setName, joinLobby, state, error, connecting } = useSession();
  const { width } = useWindowDimensions();
  const [draft, setDraft] = useState<string | null>(null);
  const [needName, setNeedName] = useState(false);
  const input = useRef<ComponentRef<typeof TextInput>>(null);
  const { x, nudge } = useNudge();
  const name = (draft ?? me.name).trim();
  const w = Math.min(width, 520);

  // In (or already in) the lobby: the game lives on the main screen.
  if (state) return <Redirect href="/" />;

  // Never a dead button: without a name, point at the field.
  const join = () => {
    if (!name) {
      setNeedName(true);
      nudge();
      input.current?.focus();
      return;
    }
    setName(name);
    void joinLobby(code);
  };

  return (
    <Screen
      tone="signal"
      stripes={{ corner: "tr", color: color.paperBright, bands: [[0.04, 0.06], [0.14, 0.03]] }}
      footer={
        <>
          {error && (
            <View accessibilityLiveRegion="polite" style={{ backgroundColor: color.inkBlack, padding: space.m, borderRadius: radius.field }}>
              <Body size={13} color={color.paperBright}>
                {error}
              </Body>
            </View>
          )}
          <Button title={connecting ? "Joining…" : `Join ${code}`} arrow disabled={code.length !== 4 || connecting} onPress={join} />
        </>
      }
    >
      <View style={{ flex: 1, paddingHorizontal: space.gutter, justifyContent: "space-between" }}>
        <View style={{ gap: space.s, marginTop: space.s }}>
          <Annotation lines={["You're", "invited!"]} color={color.paperBright} size={26} rotate={-6} />
          <Display size={170} fit={w - space.gutter * 2} style={{ letterSpacing: 4, marginTop: space.m }}>
            {code || "????"}
          </Display>
          <Body color={color.paperBright} style={{ maxWidth: 320 }}>
            Friends write dares, you get dealt theirs, and you prove each one with a photo before the clock runs out.
          </Body>
        </View>
        <View style={{ gap: space.s, marginBottom: space.s }}>
          <Label size={12} bold color={color.paperBright}>
            {needName && !name ? "Add your name first" : "Your name"}
          </Label>
          <NameField inputRef={input} value={draft ?? me.name} onChange={setDraft} onSubmit={join} shake={x} />
        </View>
      </View>
    </Screen>
  );
}
