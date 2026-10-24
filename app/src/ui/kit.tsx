import Feather from "@expo/vector-icons/Feather";
import { createContext, useContext, useEffect, useState, type ComponentProps, type ReactNode } from "react";
import { Animated, Pressable, StyleSheet, Switch, Text, View, type TextProps, type TextStyle, type ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { fitLine } from "./fit";
import { Stripes, type StripesProps } from "./Stripes";
import { SKEW, color, font, palettes, radius, space, type Palette, type Tone } from "./theme";

export type IconName = ComponentProps<typeof Feather>["name"];

const PaletteContext = createContext<Palette>(palettes.paper);
export const usePalette = () => useContext(PaletteContext);
export const PaletteProvider = ({ tone, children }: { tone: Tone; children: ReactNode }) => (
  <PaletteContext.Provider value={palettes[tone]}>{children}</PaletteContext.Provider>
);

// MARK: Type

type TP = TextProps & { color?: string; style?: TextStyle | TextStyle[] };

/**
 * Hero type: condensed black, uppercase, slanted. Line height stays at 1.0 —
 * iOS clips glyphs below that — so stack lines with negative margins instead.
 * `fit`: the width available; the size shrinks (from measured glyph widths) so
 * one line always fits — never an ellipsis, never a page wider than the screen.
 */
export function Display({ size, fit, skew = true, color: c, style, ...rest }: TP & { size: number; fit?: number; skew?: boolean }) {
  const pal = usePalette();
  const text = typeof rest.children === "string" ? rest.children : "";
  const s = fit && text ? fitLine(text, fit, size, 0, skew) : size;
  return (
    <Text
      {...rest}
      numberOfLines={fit ? 1 : rest.numberOfLines}
      style={[
        { fontFamily: font.display, fontSize: s, lineHeight: s, color: c ?? pal.fg, textTransform: "uppercase" },
        skew ? { transform: [{ skewX: SKEW }] } : null,
        style as TextStyle,
      ]}
    />
  );
}

/** Mono caps label. */
export function Label({ size = 12, bold = false, color: c, style, ...rest }: TP & { size?: number; bold?: boolean }) {
  const pal = usePalette();
  return (
    <Text
      {...rest}
      style={[
        { fontFamily: bold ? font.monoBold : font.mono, fontSize: size, letterSpacing: size * 0.08, color: c ?? pal.muted, textTransform: "uppercase" },
        style as TextStyle,
      ]}
    />
  );
}

/** Reading text — mono, like the reference's quest cards. */
export function Body({ size = 15, medium = false, color: c, style, ...rest }: TP & { size?: number; medium?: boolean }) {
  const pal = usePalette();
  return (
    <Text
      {...rest}
      style={[{ fontFamily: medium ? font.bodyMedium : font.body, fontSize: size, lineHeight: size * 1.45, color: c ?? pal.fg }, style as TextStyle]}
    />
  );
}

/** "PLAYERS (4/4)" — the heading over a list. */
export function SectionLabel({ children, right }: { children: ReactNode; right?: ReactNode }) {
  const pal = usePalette();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 22 }}>
      <Label size={13} bold color={pal.fg}>
        {children}
      </Label>
      {right}
    </View>
  );
}

export function Hairline({ emphasized = false, style }: { emphasized?: boolean; style?: ViewStyle }) {
  const pal = usePalette();
  return <View style={[{ height: emphasized ? 2 : StyleSheet.hairlineWidth * 2, backgroundColor: emphasized ? pal.accent : pal.line }, style]} />;
}

// MARK: Structure

export function IconButton({ icon, onPress, label, tone }: { icon: IconName; onPress: () => void; label: string; tone?: "solid" }) {
  const pal = usePalette();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      style={({ pressed }) => [styles.iconButton, { backgroundColor: tone === "solid" ? pal.accent : "transparent", opacity: pressed ? 0.6 : 1 }]}
    >
      <Feather name={icon} size={22} color={tone === "solid" ? pal.onAccent : pal.fg} />
    </Pressable>
  );
}

/**
 * Every screen: a tone, an optional stripe ornament, a header (centered mono
 * title, an optional back/close button, an optional right accessory), content,
 * and an action area at the bottom.
 */
export function Screen({
  title,
  tone = "paper",
  left,
  right,
  stripes,
  footer,
  children,
}: {
  title?: ReactNode;
  tone?: Tone;
  left?: { icon: IconName; onPress: () => void; label: string };
  right?: ReactNode;
  stripes?: StripesProps | StripesProps[];
  footer?: ReactNode;
  children: ReactNode;
}) {
  const pal = palettes[tone];
  const stripeList = stripes ? (Array.isArray(stripes) ? stripes : [stripes]) : [];
  return (
    <PaletteProvider tone={tone}>
      <View style={{ flex: 1, backgroundColor: pal.bg, overflow: "hidden" }}>
        {stripeList.map((s, i) => (
          <Stripes key={i} {...s} />
        ))}
        <SafeAreaView style={{ flex: 1 }} edges={["top", "bottom"]}>
          <View style={styles.header}>
            <View style={styles.headerSide}>{left ? <IconButton {...left} /> : null}</View>
            <View style={{ flex: 1, alignItems: "center" }}>
              {typeof title === "string" ? (
                <Label size={14} bold color={pal.fg} numberOfLines={1}>
                  {title}
                </Label>
              ) : (
                title
              )}
            </View>
            <View style={[styles.headerSide, { justifyContent: "flex-end" }]}>{right}</View>
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

/**
 * Pill button. On paper, primary is red; on red, it's paper with red text.
 * `arrow` adds the trailing →; `tilt` rotates it a few degrees, sticker-style.
 */
export function Button({
  title,
  onPress,
  kind = "primary",
  icon,
  arrow,
  tilt = 0,
  size = "lg",
  disabled,
  style,
}: {
  title: string;
  onPress: () => void;
  kind?: ButtonKind;
  icon?: IconName;
  arrow?: boolean;
  tilt?: number;
  size?: "lg" | "md";
  disabled?: boolean;
  style?: ViewStyle;
}) {
  const pal = usePalette();
  const fg = kind === "primary" ? pal.onAccent : kind === "outline" ? pal.accent : pal.muted;
  const big = size === "lg";
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled }}
      style={({ pressed }) => [
        styles.pill,
        {
          minHeight: big ? 60 : 48,
          backgroundColor: kind === "primary" ? pal.accent : "transparent",
          borderColor: kind === "outline" ? pal.accent : "transparent",
          opacity: disabled ? 0.45 : 1,
          transform: [{ rotate: `${tilt}deg` }, { scale: pressed ? 0.97 : 1 }],
        },
        style,
      ]}
    >
      {icon && <Feather name={icon} size={big ? 24 : 18} color={fg} />}
      <Display size={big ? 28 : 20} color={fg} numberOfLines={1} style={{ flexShrink: 1 }}>
        {title}
      </Display>
      {arrow && <Feather name="arrow-right" size={big ? 24 : 18} color={fg} />}
    </Pressable>
  );
}

/** Small pill: "HOST", "BOT", "AI". */
export function Tag({ text, tone = "red" }: { text: string; tone?: "red" | "gray" | "ink" | "outline" | "paper" }) {
  const pal = usePalette();
  const bg = { red: color.signalRed, gray: color.stone, ink: color.inkBlack, outline: "transparent", paper: color.paperBright }[tone];
  const fg = { red: color.paperBright, gray: color.paperBright, ink: color.paperBright, outline: pal.muted, paper: color.signalRed }[tone];
  return (
    <View style={[styles.tag, { backgroundColor: bg, borderColor: tone === "outline" ? pal.line : "transparent" }]}>
      <Label size={10} bold color={fg} style={{ letterSpacing: 0.6 }}>
        {text}
      </Label>
    </View>
  );
}

/** Circle with initials. Humans are red, bots gray; `ring` marks you. */
export function Avatar({ name, size = 40, bot, ring, away }: { name: string; size?: number; bot?: boolean; ring?: boolean; away?: boolean }) {
  const initials =
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0])
      .join("")
      .toUpperCase() || "?";
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: bot ? color.stone : color.signalRed,
        borderWidth: ring ? 3 : 0,
        borderColor: color.inkBlack,
        opacity: away ? 0.4 : 1,
      }}
    >
      <Text style={{ fontFamily: font.monoBold, fontSize: size * 0.36, color: color.paperBright, letterSpacing: 0.5 }}>{initials}</Text>
    </View>
  );
}

/** Rounded cream card with a hairline. */
export function Card({ children, style, tilt = 0 }: { children: ReactNode; style?: ViewStyle; tilt?: number }) {
  const pal = usePalette();
  return (
    <View
      style={[
        {
          backgroundColor: color.paperBright,
          borderRadius: radius.card,
          borderWidth: 1.5,
          borderColor: pal === palettes.signal ? "transparent" : color.paperLine,
          padding: space.m,
        },
        tilt ? { transform: [{ rotate: `${tilt}deg` }] } : null,
        style,
      ]}
    >
      {children}
    </View>
  );
}

/** "I'M DONE ●" — a label and a switch in an outlined pill. */
export function SwitchRow({ label, value, onChange, detail }: { label: string; value: boolean; onChange: (v: boolean) => void; detail?: string }) {
  const pal = usePalette();
  return (
    <Pressable onPress={() => onChange(!value)} accessibilityRole="switch" accessibilityState={{ checked: value }} style={[styles.switchRow, { borderColor: pal.accent }]}>
      <View style={{ flex: 1 }}>
        <Display size={22} color={pal.accent}>
          {label}
        </Display>
        {detail ? (
          <Label size={10} style={{ marginTop: 2 }}>
            {detail}
          </Label>
        ) : null}
      </View>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: color.signalRed, false: color.paperLine }} thumbColor={color.paperBright} />
    </Pressable>
  );
}

export function WaitingBar({ text }: { text: string }) {
  const pal = usePalette();
  const [pulse] = useState(() => new Animated.Value(0.25));
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 800, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.25, duration: 800, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  return (
    <View style={[styles.switchRow, { borderColor: pal.line, justifyContent: "center", gap: space.s }]}>
      <Animated.View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: pal.accent, opacity: pulse }} />
      <Label size={12} bold numberOfLines={2} style={{ textAlign: "center", flexShrink: 1 }}>
        {text}
      </Label>
    </View>
  );
}

export const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: space.s, minHeight: 52 },
  headerSide: { width: 72, flexDirection: "row", alignItems: "center", paddingHorizontal: space.xs },
  footer: { paddingHorizontal: space.gutter, paddingTop: space.s, paddingBottom: space.s, gap: space.s },
  iconButton: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  pill: { borderRadius: radius.pill, paddingHorizontal: space.l, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: space.s, borderWidth: 2 },
  tag: { borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, alignSelf: "center" },
  switchRow: { minHeight: 60, borderRadius: radius.pill, borderWidth: 2, flexDirection: "row", alignItems: "center", paddingLeft: space.l, paddingRight: space.m },
  gutter: { paddingHorizontal: space.gutter },
});

export { color, font, radius, space };
export type { StripesProps };
