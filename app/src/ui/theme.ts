// Concept: "start flag". A race-day poster printed in two inks — signal red
// and paper white — with near-black for reading text.
// Rules:
//  • Two tones only. Calm screens are paper; the high-energy moments (home,
//    the live quest, game over, the winner) flip to a full red field.
//  • Condensed black display type, set big. Mono for labels and numbers.
//  • Sharp corners, hairline rules, no shadows, no gradients.
//  • The only ornament is the halftone burst (Halftone.tsx), always printed
//    tonally — one step off the ground — so it never fights the type.

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
  mono: "JetBrainsMono_600SemiBold",
  monoBold: "JetBrainsMono_700Bold",
} as const;

export const space = { xs: 4, s: 8, m: 16, l: 24, xl: 40, gutter: 20 } as const;
