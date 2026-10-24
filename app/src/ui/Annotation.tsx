import { View, type ViewStyle } from "react-native";
import Svg, { Path } from "react-native-svg";
import { Display } from "./kit";

/**
 * A hand-set aside — "DARES. FRIENDS. PROOF." — slanted, tilted, underlined,
 * optionally with a doodled arrow pointing at something.
 */
export function Annotation({
  lines,
  color,
  size = 20,
  rotate = -8,
  arrow,
  style,
}: {
  lines: string[];
  color: string;
  size?: number;
  rotate?: number;
  arrow?: "down-left" | "up-right";
  style?: ViewStyle;
}) {
  return (
    <View style={[{ transform: [{ rotate: `${rotate}deg` }], alignItems: "flex-start" }, style]} accessibilityLabel={lines.join(" ")}>
      {lines.map((l, i) => (
        <Display key={i} size={size} color={color} style={{ marginTop: i ? -size * 0.12 : 0 }}>
          {l}
        </Display>
      ))}
      <View style={{ height: 3, width: "100%", backgroundColor: color, marginTop: 3, borderRadius: 2, transform: [{ rotate: "-2deg" }] }} />
      {arrow && (
        <Svg width={size * 2} height={size * 1.6} style={{ marginTop: 4, alignSelf: arrow === "up-right" ? "flex-end" : "flex-start" }} viewBox="0 0 40 32">
          {arrow === "down-left" ? (
            <Path d="M34 2 C 30 18, 20 26, 6 26 M6 26 L 14 20 M6 26 L 13 31" stroke={color} strokeWidth={3} fill="none" strokeLinecap="round" />
          ) : (
            <Path d="M6 30 C 10 16, 20 8, 34 6 M34 6 L 26 2 M34 6 L 28 13" stroke={color} strokeWidth={3} fill="none" strokeLinecap="round" />
          )}
        </Svg>
      )}
    </View>
  );
}
