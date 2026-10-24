import { mulberry32 } from "@side-quests/game";
import { memo, useMemo, useState } from "react";
import { StyleSheet, View, type LayoutChangeEvent } from "react-native";
import Svg, { Path } from "react-native-svg";

/**
 * The app's one ornament: a seeded halftone "burst". Dots on a rotated
 * screen swell toward an off-center focal point, with a few speed bars
 * shooting away from it — like a riso-printed race poster.
 */
export interface HalftoneSpec {
  seed: number;
  /** Focal point in unit coordinates. Keep it away from where text sits. */
  focus: [number, number];
  /** How far the dots reach, as a fraction of the diagonal. */
  reach?: number;
  spacing?: number;
  /** Rotation of the dot screen, degrees. */
  angle?: number;
  bars?: number;
}

export const halftones = {
  home: { seed: 7, focus: [1.05, 0.02], reach: 0.62, spacing: 15, angle: 152, bars: 6 },
  inGame: { seed: 3, focus: [1.1, 0.95], reach: 0.6, spacing: 13, angle: 205, bars: 4 },
  gameOver: { seed: 21, focus: [0.95, 0.12], reach: 0.48, spacing: 14, angle: 160, bars: 5 },
  winner: { seed: 42, focus: [1.0, 0.0], reach: 0.7, spacing: 12, angle: 140, bars: 3 },
  lobby: { seed: 5, focus: [1.05, 0.08], reach: 0.42, spacing: 11, angle: 150, bars: 0 },
} satisfies Record<string, HalftoneSpec>;

/** One SVG path for all dots and one for all bars — thousands of elements would be slow. */
export function halftonePaths(spec: HalftoneSpec, w: number, h: number): { dots: string; bars: string } {
  const { seed, focus, reach = 0.55, spacing = 14, angle = 28, bars = 5 } = spec;
  const rand = mulberry32(seed);
  const diag = Math.hypot(w, h);
  const fx = focus[0] * w;
  const fy = focus[1] * h;
  const a = (angle * Math.PI) / 180;
  const ca = Math.cos(a);
  const sa = Math.sin(a);
  const cx = w / 2;
  const cy = h / 2;
  const n = Math.ceil(diag / spacing) + 2;
  const dots: string[] = [];

  for (let i = -n; i <= n; i++) {
    for (let j = -n; j <= n; j++) {
      const gx = i * spacing;
      const gy = j * spacing;
      const x = cx + gx * ca - gy * sa;
      const y = cy + gx * sa + gy * ca;
      if (x < -spacing || y < -spacing || x > w + spacing || y > h + spacing) continue;
      const d = Math.hypot(x - fx, y - fy) / (reach * diag);
      if (d >= 1) continue;
      // Ease-in falloff, slight per-dot jitter so it reads as printed, not computed.
      const v = Math.pow(1 - d, 1.7) * (0.85 + 0.3 * rand());
      const r = spacing * 0.5 * Math.min(1, v * 1.25);
      if (r <= 0.7) continue;
      dots.push(`M${(x - r).toFixed(1)} ${y.toFixed(1)}a${r.toFixed(1)} ${r.toFixed(1)} 0 1 0 ${(2 * r).toFixed(1)} 0a${r.toFixed(1)} ${r.toFixed(1)} 0 1 0 ${(-2 * r).toFixed(1)} 0`);
    }
  }

  // Speed bars: shoot from the focus toward the middle of the frame.
  const toward = Math.atan2(cy - fy, cx - fx);
  const barPaths: string[] = [];
  for (let k = 0; k < bars; k++) {
    const offset = (k - (bars - 1) / 2) * spacing * (1.6 + rand());
    const length = diag * (0.14 + 0.24 * rand());
    const thick = spacing * [0.35, 0.6, 1.0, 1.6][Math.floor(rand() * 4)];
    const start = (0.04 + 0.12 * rand()) * diag;
    const rot = toward + ((rand() - 0.5) * 6 * Math.PI) / 180;
    const ux = Math.cos(rot);
    const uy = Math.sin(rot);
    const px = -uy;
    const py = ux;
    const pt = (along: number, across: number) =>
      `${(fx + ux * along + px * across).toFixed(1)} ${(fy + uy * along + py * across).toFixed(1)}`;
    const o0 = offset - thick / 2;
    const o1 = offset + thick / 2;
    barPaths.push(`M${pt(start, o0)}L${pt(start + length, o0)}L${pt(start + length, o1)}L${pt(start, o1)}Z`);
  }
  return { dots: dots.join(""), bars: barPaths.join("") };
}

/** Fills its parent; draws once it knows its size. */
export const Halftone = memo(function Halftone({ spec, color }: { spec: HalftoneSpec; color: string }) {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const paths = useMemo(() => (size ? halftonePaths(spec, size.w, size.h) : null), [spec, size]);
  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (!size || Math.abs(size.w - width) > 1 || Math.abs(size.h - height) > 1) setSize({ w: width, h: height });
  };
  return (
    <View style={StyleSheet.absoluteFill} onLayout={onLayout} pointerEvents="none" aria-hidden>
      {size && paths && (
        <Svg width={size.w} height={size.h}>
          <Path d={paths.dots} fill={color} />
          <Path d={paths.bars} fill={color} />
        </Svg>
      )}
    </View>
  );
});
