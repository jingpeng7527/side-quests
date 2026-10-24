import Feather from "@expo/vector-icons/Feather";
import type { DevOp } from "@side-quests/game";
import { useState } from "react";
import { Modal, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useSession } from "../lib/session";
import { Hairline, Label, PaletteProvider, usePalette } from "./kit";
import { color, radius, space } from "./theme";

/**
 * Debug shortcuts — a small "DEV" pill in the header of every game screen.
 * Host only, and only when the server runs with DEV_TOOLS.
 */
export function DevMenu() {
  const { state, dev, isHost } = useSession();
  const pal = usePalette();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  if (!state?.devTools || !isHost) return null;

  const phase = state.phase;
  const items: [string, DevOp, boolean?][] = [
    ["Skip to end of game", { op: "skipToEnd" }, phase === "ended" || phase === "verifying" || phase === "scoreboard"],
    ...(phase === "playing"
      ? ([
          ["Bots complete a quest each", { op: "simulateRounds", rounds: 1 }],
          ["Add 30s to the clock", { op: "addTime", seconds: 30 }],
          ["Deal me a quest with a place", { op: "dealPlaceQuest" }],
        ] as [string, DevOp][])
      : []),
    ["Jump to verification", { op: "jump", phase: "verifying" }],
    ["Jump to scoreboard", { op: "jump", phase: "scoreboard" }],
    ["Add a bot", { op: "addBot" }],
  ];

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityLabel="Developer shortcuts"
        hitSlop={8}
        style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: pal.fg, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 4 }}
      >
        <Feather name="tool" size={11} color={pal.bg} />
        <Label size={10} bold color={pal.bg}>
          Dev
        </Label>
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <PaletteProvider tone="paper">
          <Pressable style={{ flex: 1, backgroundColor: "rgba(23,17,15,0.5)", justifyContent: "flex-end" }} onPress={() => setOpen(false)}>
            <View style={{ backgroundColor: color.paper, paddingBottom: insets.bottom + space.m, borderTopLeftRadius: 28, borderTopRightRadius: 28 }}>
              <View style={{ padding: space.m, paddingTop: space.l }}>
                <Label bold>Dev shortcuts</Label>
              </View>
              {items.map(([title, op, disabled]) => (
                <View key={title}>
                  <Hairline />
                  <Pressable
                    disabled={disabled}
                    onPress={() => {
                      dev(op);
                      setOpen(false);
                    }}
                    style={{ padding: space.m, opacity: disabled ? 0.35 : 1 }}
                  >
                    <Label size={13} bold color={color.inkBlack}>
                      {title}
                    </Label>
                  </Pressable>
                </View>
              ))}
            </View>
          </Pressable>
        </PaletteProvider>
      </Modal>
    </>
  );
}
