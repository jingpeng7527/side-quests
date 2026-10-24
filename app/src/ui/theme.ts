// Concept: "race-day zine". The same two inks — signal red and paper — with
// near-black for reading, set with sticker-and-marker energy.
// Rules:
//  • Two tones. Calm screens are paper; the live moments (home, the quest,
//    game over) flip to a full red field.
//  • Hero type is condensed black, slanted (SKEW) and allowed to tilt and
//    bleed. Everything you read is mono.
//  • Soft geometry: pill buttons and tags, rounded cards, circle avatars.
//    No shadows, no gradients — hairlines and fills only.
//  • The ornament is the racing stripe (Stripes.tsx): a few diagonal bands
//    at a corner. Hand-set asides (Annotation) add the human touch.

export const color = {
  signalRed: "#D9241C", // oklch(0.57 0.215 29) — 4.8:1 with paperBright
  deepRed: "#B01B14",
  paper: "#F6F2EC", // warm off-white ground
  paperBright: "#FFFAF6", // type on red
  inkBlack: "#17110F", // warm near-black
  stone: "#6B645E", // muted text on paper, 5.2:1
  paperLine: "#DDD6CD",
  paperRaised: "#ECE6DE",
  blush: "#F0CFC6", // halftone ink on paper
} as const;

/** Every color a component needs, resolved per tone. */
export interface Palette {
  bg: string;
  fg: string;
  muted: string;
  line: string;
  raised: string;
  accent: string;
  onAccent: string;
  /** The halftone ink on this ground. */
  art: string;
}

export type Tone = "paper" | "signal";

export const palettes: Record<Tone, Palette> = {
  paper: {
    bg: color.paper,
    fg: color.inkBlack,
    muted: color.stone,
    line: color.paperLine,
    raised: color.paperRaised,
    accent: color.signalRed,
    onAccent: color.paperBright,
    art: color.blush,
  },
  // On red, small text stays full white: tints of white drop below AA.
  signal: {
    bg: color.signalRed,
    fg: color.paperBright,
    muted: color.paperBright,
    line: "rgba(255,250,246,0.35)",
    raised: color.deepRed,
    accent: color.paperBright,
    onAccent: color.signalRed,
    art: color.deepRed,
  },
};

export const font = {
  display: "BigShouldersDisplay_900Black",
  body: "JetBrainsMono_400Regular",
  bodyMedium: "JetBrainsMono_500Medium",
  mono: "JetBrainsMono_600SemiBold",
  monoBold: "JetBrainsMono_700Bold",
} as const;

export const radius = { pill: 999, card: 18, field: 14, chip: 8 } as const;

/** The slant on hero type. */
export const SKEW = "-9deg";
/** How much wider slanted type gets at its top edge, per unit of font size (tan 9°). */
export const SKEW_SPREAD = 0.16;

export const space = { xs: 4, s: 8, m: 16, l: 24, xl: 40, gutter: 20 } as const;
