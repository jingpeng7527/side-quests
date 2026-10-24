import { memo, useState } from "react";
import { StyleSheet, View, type LayoutChangeEvent } from "react-native";
import Svg, { Polygon } from "react-native-svg";

/**
 * The racing stripe: a few diagonal bands across one corner of the screen.
 * Offsets and thicknesses are fractions of the screen's shorter side.
 */
export interface StripesProps {
  corner: "tl" | "tr" | "bl" | "br";
  color: string;
  /** [distance from the corner, thickness] pairs. */
  bands?: [number, number][];
  /** Band angle in degrees from horizontal. */
  angle?: number;
  opacity?: number;
}

export const Stripes = memo(function Stripes({ corner, color, bands = [[0.16, 0.07], [0.3, 0.035]], angle = 32, opacity = 1 }: StripesProps) {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (!size || Math.abs(size.w - width) > 1 || Math.abs(size.h - height) > 1) setSize({ w: width, h: height });
  };

  let polys: string[] = [];
  if (size) {
    const { w, h } = size;
    const unit = Math.min(w, h);
    const cx = corner.includes("r") ? w : 0;
    const cy = corner.includes("b") ? h : 0;
    // Bands run perpendicular to the corner's diagonal, at `angle`.
    const a = (angle * Math.PI) / 180;
    const sx = corner.includes("r") ? -1 : 1;
    const sy = corner.includes("b") ? -1 : 1;
    const dir = { x: Math.cos(a) * sx, y: -Math.sin(a) * sy }; // along the band
    const nrm = { x: Math.sin(a) * sx, y: Math.cos(a) * sy }; // toward the screen's interior
    const L = Math.hypot(w, h) * 2;
    polys = bands.map(([offset, thick]) => {
      const o1 = offset * unit;
      const o2 = (offset + thick) * unit;
      const p = (o: number, t: number) => `${cx + nrm.x * o + dir.x * t},${cy + nrm.y * o + dir.y * t}`;
      return [p(o1, -L), p(o1, L), p(o2, L), p(o2, -L)].join(" ");
    });
  }

  return (
    <View style={StyleSheet.absoluteFill} onLayout={onLayout} pointerEvents="none" aria-hidden>
      {size && (
        <Svg width={size.w} height={size.h}>
          {polys.map((points, i) => (
            <Polygon key={i} points={points} fill={color} opacity={opacity} />
          ))}
        </Svg>
      )}
    </View>
  );
});
