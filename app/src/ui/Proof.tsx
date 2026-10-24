import { mulberry32, type Proof } from "@side-quests/game";
import { useState } from "react";
import { ActivityIndicator, Image, StyleSheet, Text, View, type ViewStyle } from "react-native";
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
export function ProofImage({
  proof,
  quest,
  by,
  style,
  large = false,
  fit = "cover",
}: {
  proof: Proof;
  quest: string;
  by: string;
  style?: ViewStyle;
  large?: boolean;
  /** "contain" shows the whole photo (zoom view); "cover" fills the frame. */
  fit?: "cover" | "contain";
}) {
  if (proof.kind === "photo") return <Photo url={proof.url} style={style} fit={fit} />;
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
      {large && <Text style={[styles.by, { color: type, fontSize: 14 * s + 3, left: 18 * s + 4, bottom: 14 * s + 3 }]}>PROOF · {by.toUpperCase()}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  quest: { fontFamily: font.display },
  by: { position: "absolute", fontFamily: font.mono, letterSpacing: 1 },
});

/** A real photo, with a quiet loading state and a clear "missing" state instead of a blank box. */
function Photo({ url, style, fit }: { url: string; style?: ViewStyle; fit: "cover" | "contain" }) {
  const [status, setStatus] = useState<"loading" | "ok" | "error">("loading");
  const uri = url.startsWith("/") ? `${serverUrl()}${url}` : url;
  return (
    <View style={[{ backgroundColor: fit === "contain" ? "transparent" : color.paperRaised, overflow: "hidden" }, style]}>
      <Image
        source={{ uri }}
        style={StyleSheet.absoluteFill}
        resizeMode={fit}
        onLoad={() => setStatus("ok")}
        onError={() => setStatus("error")}
        accessibilityIgnoresInvertColors
      />
      {status !== "ok" && (
        <View style={[StyleSheet.absoluteFill, { alignItems: "center", justifyContent: "center", gap: 8 }]}>
          {status === "loading" ? (
            <ActivityIndicator color={color.signalRed} />
          ) : (
            <Text style={{ fontFamily: font.mono, fontSize: 11, letterSpacing: 1.4, color: color.stone }}>PHOTO MISSING</Text>
          )}
        </View>
      )}
    </View>
  );
}
