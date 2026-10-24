import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Animated, Pressable, StyleSheet, Text, View, type TextProps, type TextStyle, type ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Halftone, type HalftoneSpec } from "./Halftone";
import { color, font, palettes, space, type Palette, type Tone } from "./theme";

const PaletteContext = createContext<Palette>(palettes.paper);
export const usePalette = () => useContext(PaletteContext);
export const PaletteProvider = ({ tone, children }: { tone: Tone; children: ReactNode }) => (
  <PaletteContext.Provider value={palettes[tone]}>{children}</PaletteContext.Provider>
);

// MARK: Type

type TP = TextProps & { color?: string; style?: TextStyle | TextStyle[] };

/**
 * Condensed black display type. Line height stays at 1.0 — iOS clips glyphs
 * below that — so stack lines tightly with negative margins instead.
 */
export function Display({ size, fit, color: c, style, ...rest }: TP & { size: number; fit?: number }) {
  const pal = usePalette();
  // `fit`: available width in px. Shrinks single-line poster type to fit on every
  // platform (adjustsFontSizeToFit doesn't exist on web). ~0.5em per uppercase glyph.
  const text = typeof rest.children === "string" ? rest.children : "";
  const s = fit && text ? Math.min(size, fit / (text.length * 0.5)) : size;
  return (
    <Text
      {...rest}
      numberOfLines={fit ? 1 : rest.numberOfLines}
      style={[{ fontFamily: font.display, fontSize: s, lineHeight: s, color: c ?? pal.fg, textTransform: "uppercase" }, style as TextStyle]}
    />
  );
}

/** Mono caps label. */
export function Label({ size = 12, color: c, style, ...rest }: TP & { size?: number }) {
  const pal = usePalette();
  return (
    <Text
      {...rest}
      style={[{ fontFamily: font.mono, fontSize: size, letterSpacing: size * 0.14, color: c ?? pal.muted, textTransform: "uppercase" }, style as TextStyle]}
    />
  );
}

export function Body({ size = 17, weight = "500", color: c, style, ...rest }: TP & { size?: number; weight?: TextStyle["fontWeight"] }) {
  const pal = usePalette();
  return <Text {...rest} style={[{ fontSize: size, lineHeight: size * 1.35, fontWeight: weight, color: c ?? pal.fg }, style as TextStyle]} />;
}

// MARK: Structure

/** "02 — QUESTS": the mono step marker heading every screen. */
export function Kicker({ index, title, trailing, accessory }: { index: string; title: string; trailing?: string; accessory?: ReactNode }) {
  const pal = usePalette();
  return (
    <View style={styles.kicker}>
      <Label color={pal.accent}>{index}</Label>
      <View style={{ width: 18, height: 1, backgroundColor: pal.line }} />
      <Label style={{ flex: 1 }} numberOfLines={1}>
        {title}
      </Label>
      {trailing ? <Label>{trailing}</Label> : null}
      {accessory}
    </View>
  );
}

export function Hairline({ emphasized = false, style }: { emphasized?: boolean; style?: ViewStyle }) {
  const pal = usePalette();
  return <View style={[{ height: emphasized ? 2 : 1, backgroundColor: emphasized ? pal.accent : pal.line }, style]} />;
}

/** Every screen: a tone, optional halftone art, kicker at top, action bar at bottom. */
export function Screen({
  index,
  title,
  trailing,
  tone = "paper",
  art,
  accessory,
  footer,
  children,
}: {
  index: string;
  title: string;
  trailing?: string;
  tone?: Tone;
  art?: HalftoneSpec;
  accessory?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}) {
  const pal = palettes[tone];
  return (
    <PaletteProvider tone={tone}>
      <View style={{ flex: 1, backgroundColor: pal.bg }}>
        {art && <Halftone spec={art} color={pal.art} />}
        <SafeAreaView style={{ flex: 1 }} edges={["top", "bottom"]}>
          <View style={{ paddingHorizontal: space.gutter, paddingTop: space.s, paddingBottom: space.m }}>
            <Kicker index={index} title={title} trailing={trailing} accessory={accessory} />
          </View>
          <View style={{ flex: 1 }}>{children}</View>
          {footer ? <View style={styles.footer}>{footer}</View> : null}
        </SafeAreaView>
      </View>
    </PaletteProvider>
  );
}

// MARK: Controls

type ButtonKind = "primary" | "outline" | "quiet";

export function SlabButton({
  title,
  onPress,
  kind = "primary",
  disabled,
  icon,
  style,
}: {
  title: string;
  onPress: () => void;
  kind?: ButtonKind;
  disabled?: boolean;
  icon?: ReactNode;
  style?: ViewStyle;
}) {
  const pal = usePalette();
  const fg = kind === "primary" ? pal.onAccent : kind === "outline" ? pal.fg : pal.muted;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      style={({ pressed }) => [
        styles.slab,
        {
          backgroundColor: kind === "primary" ? pal.accent : "transparent",
          borderColor: kind === "outline" ? pal.fg : "transparent",
          opacity: disabled ? 0.4 : 1,
          transform: [{ scale: pressed ? 0.97 : 1 }],
        },
        style,
      ]}
    >
      {icon}
      <Display size={26} color={fg} numberOfLines={1}>
        {title}
      </Display>
    </Pressable>
  );
}

/** Small sharp tag, e.g. "AI" or "HOST". */
export function Tag({ text, filled = false }: { text: string; filled?: boolean }) {
  const pal = usePalette();
  return (
    <View style={[styles.tag, { backgroundColor: filled ? pal.accent : "transparent", borderColor: filled ? "transparent" : pal.line }]}>
      <Label size={10} color={filled ? pal.onAccent : pal.muted}>
        {text}
      </Label>
    </View>
  );
}

export function Avatar({ name, size = 36, highlighted = false }: { name: string; size?: number; highlighted?: boolean }) {
  const pal = usePalette();
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center", backgroundColor: highlighted ? pal.accent : pal.raised }}>
      <Display size={size * 0.62} color={highlighted ? pal.onAccent : pal.fg} style={{ lineHeight: size * 0.75, marginTop: size * 0.08 }}>
        {name.slice(0, 1)}
      </Display>
    </View>
  );
}

export function WaitingBar({ text }: { text: string }) {
  const pal = usePalette();
  const [pulse] = useState(() => new Animated.Value(0.2));
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 800, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.2, duration: 800, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  return (
    <View style={[styles.waiting, { borderColor: pal.line }]}>
      <Animated.View style={{ width: 8, height: 8, backgroundColor: pal.accent, opacity: pulse }} />
      <Label size={13}>{text}</Label>
    </View>
  );
}

export const styles = StyleSheet.create({
  kicker: { flexDirection: "row", alignItems: "center", gap: space.s, minHeight: 22 },
  footer: { paddingHorizontal: space.gutter, paddingTop: space.s, paddingBottom: space.s, gap: space.s },
  slab: { minHeight: 60, paddingHorizontal: space.m, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: space.s, borderWidth: 2 },
  tag: { paddingHorizontal: 6, paddingVertical: 3, borderWidth: 1, alignSelf: "flex-start" },
  waiting: { minHeight: 60, borderWidth: 2, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: space.s },
  gutter: { paddingHorizontal: space.gutter },
});

export { color, font, space };
