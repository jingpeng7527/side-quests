import type { DevOp } from "@side-quests/game";
import { useState } from "react";
import { Modal, Pressable, View } from "react-native";
import { useSession } from "../lib/session";
import { Hairline, Label, PaletteProvider, usePalette } from "./kit";
import { color, space } from "./theme";

/**
 * Debug shortcuts — the DEV tag sits in the header of every game screen.
 * Only shown when the server runs with DEV_TOOLS.
 */
export function DevMenu() {
  const { state, dev, isHost } = useSession();
  const pal = usePalette();
  const [open, setOpen] = useState(false);
  // Host only: these end games and add bots for everyone.
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
    ...(isHost ? ([["Add a bot", { op: "addBot" }]] as [string, DevOp][]) : []),
  ];

  return (
    <>
      <Pressable onPress={() => setOpen(true)} accessibilityLabel="Developer shortcuts" style={{ backgroundColor: pal.fg, paddingHorizontal: 6, paddingVertical: 3 }}>
        <Label size={10} color={pal.bg}>
          Dev
        </Label>
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <PaletteProvider tone="paper">
          <Pressable style={{ flex: 1, backgroundColor: "rgba(23,17,15,0.5)", justifyContent: "flex-end" }} onPress={() => setOpen(false)}>
            <View style={{ backgroundColor: color.paper, paddingBottom: space.xl }}>
              <View style={{ padding: space.m }}>
                <Label>Dev shortcuts</Label>
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
                    <Label size={13} color={color.inkBlack}>
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
