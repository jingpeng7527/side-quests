import { mulberry32, type Proof } from "@side-quests/game";
import { Image, StyleSheet, Text, View, type ViewStyle } from "react-native";
import { serverUrl } from "../lib/config";
import { Halftone, type HalftoneSpec } from "./Halftone";
import { color, font } from "./theme";

/** Duotone ink pairs for stand-in "photos": background, dots, type. */
const INKS: [string, string, string][] = [
  [color.signalRed, color.paperBright, color.paperBright],
  [color.paper, color.signalRed, color.inkBlack],
  [color.inkBlack, color.signalRed, color.paperBright],
];

/** A proof photo — real, or a halftone stand-in generated from its seed. */
export function ProofImage({ proof, quest, by, style, large = false }: { proof: Proof; quest: string; by: string; style?: ViewStyle; large?: boolean }) {
  if (proof.kind === "photo") {
    const uri = proof.url.startsWith("/") ? `${serverUrl()}${proof.url}` : proof.url;
    return <Image source={{ uri }} style={[{ backgroundColor: color.paperRaised }, style as object]} resizeMode="cover" />;
  }
  const rand = mulberry32(proof.seed);
  const [bg, ink, type] = INKS[Math.floor(rand() * INKS.length)];
  const spec: HalftoneSpec = {
    seed: proof.seed,
    // Thumbnails keep the burst low and small so the quest text stays legible.
    focus: [0.2 + rand() * 0.7, large ? 0.55 + rand() * 0.4 : 0.8 + rand() * 0.2],
    reach: large ? 0.45 + rand() * 0.25 : 0.3 + rand() * 0.12,
    spacing: large ? 14 : 6,
    angle: rand() * 180,
    bars: 2 + Math.floor(rand() * 5),
  };
  const s = large ? 1 : 0.32;
  return (
    <View style={[{ backgroundColor: bg, overflow: "hidden" }, style]}>
      <Halftone spec={spec} color={ink} />
      <Text numberOfLines={4} style={[styles.quest, { color: type, fontSize: 40 * s + 6, lineHeight: (40 * s + 6) * 0.95, padding: 18 * s + 4 }]}>
        {quest.toUpperCase()}
      </Text>
      <Text style={[styles.by, { color: type, fontSize: 14 * s + 3, left: 18 * s + 4, bottom: 14 * s + 3 }]}>PROOF · {by.toUpperCase()}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  quest: { fontFamily: font.display },
  by: { position: "absolute", fontFamily: font.mono, letterSpacing: 1 },
});
