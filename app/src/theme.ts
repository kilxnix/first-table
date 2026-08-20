import { Platform } from "react-native";

/**
 * "Candlelit table" theme. The DM's imagination is the renderer; the app's job
 * is warm, abstract light — never literal game art (spec §9.5).
 */
export const theme = {
  // Ground
  bg: "#0f0b08",
  panel: "#1c1512",
  card: "#261d17",
  raised: "#2f241c",

  // Ink
  text: "#f2e8d5",
  dim: "#a3937c",
  faint: "#6f6252",

  // Candle
  accent: "#e0a83f",
  accentBright: "#f2c164",
  accentDeep: "#9c6f22",
  danger: "#c0503f",
  ember: "#d4683a",

  // Bubbles
  dmBubble: "#3a2c1f",
  agentBubble: "#211a15",
  systemText: "#8a7f6e",
  border: "#3a2f24",
  hairline: "#4a3b2c",
} as const;

/** Per-seat accent: name labels + avatar rings, so the thread scans at a glance. */
export const seatColors: Record<string, string> = {
  seat1: "#8fa8d8", // Marcus — arcane steel-blue
  seat2: "#9dc46a", // Pix — mischief green
  seat3: "#cbaad6", // Wren — dove lilac
};

export const seatColor = (seat: string | null | undefined): string =>
  (seat && seatColors[seat]) || theme.accent;

/** Mood canvas gradient presets (top → bottom), keyed by story temperature. */
export const moods = {
  dusk: ["#171009", "#120d09", "#0f0b08"],
  ember: ["#1d0f08", "#160d08", "#0f0b08"],
  night: ["#0e0d12", "#0e0b0c", "#0f0b08"],
} as const;
export type Mood = keyof typeof moods;

/** Font families (loaded in App via expo-font; fall back to system serif). */
export const fonts = {
  display: Platform.select({ web: "Cinzel_700Bold, Georgia, serif", default: "Cinzel_700Bold" })!,
  displayLight: Platform.select({ web: "Cinzel_400Regular, Georgia, serif", default: "Cinzel_400Regular" })!,
  speech: Platform.select({ web: "Alegreya_400Regular, Georgia, serif", default: "Alegreya_400Regular" })!,
  speechItalic: Platform.select({ web: "Alegreya_400Regular_Italic, Georgia, serif", default: "Alegreya_400Regular_Italic" })!,
  speechBold: Platform.select({ web: "Alegreya_700Bold, Georgia, serif", default: "Alegreya_700Bold" })!,
} as const;
