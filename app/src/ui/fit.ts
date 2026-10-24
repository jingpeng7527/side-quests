import { DISPLAY_FALLBACK, DISPLAY_WIDTHS } from "./fontMetrics";
import { SKEW_SPREAD } from "./theme";

/** Width of `text` in the display face, in em (uppercased, as Display renders it). */
export function displayWidthEm(text: string, letterSpacingEm = 0): number {
  let w = 0;
  for (const ch of text.toUpperCase()) w += (DISPLAY_WIDTHS[ch] ?? DISPLAY_FALLBACK) + letterSpacingEm;
  return w;
}

/** Largest size (≤ max) at which one line of display text fits `width`, slant included. */
export function fitLine(text: string, width: number, max: number, letterSpacingEm = 0, skewed = true): number {
  const em = displayWidthEm(text, letterSpacingEm) + (skewed ? SKEW_SPREAD : 0);
  return Math.max(10, Math.floor(Math.min(max, width / Math.max(em, 0.1))));
}

/** How many lines `text` wraps to at `size` within `width` (greedy, by words). */
export function wrapLines(text: string, width: number, size: number): number {
  const space = (DISPLAY_WIDTHS[" "] ?? 0.22) * size;
  let lines = 1;
  let used = 0;
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const w = displayWidthEm(word) * size;
    if (used > 0 && used + space + w > width) {
      lines++;
      used = w;
    } else {
      used += (used > 0 ? space : 0) + w;
    }
  }
  return lines;
}

/**
 * Largest size (≤ max, ≥ min) at which `text` wraps within `width` × `height`
 * and no single word is wider than the line — so long words never push the
 * page sideways.
 */
export function fitBlock(text: string, width: number, height: number, max: number, min = 20, lineHeight = 1): number {
  const usable = width - max * SKEW_SPREAD;
  const longest = Math.max(...text.split(/\s+/).map((w) => displayWidthEm(w)), 0.1);
  for (let size = Math.floor(max); size > min; size -= 2) {
    if (longest * size > usable) continue;
    if (wrapLines(text, usable, size) * size * lineHeight <= height) return size;
  }
  return Math.min(min, Math.floor(usable / longest));
}
