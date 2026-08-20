import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useRef, useState } from "react";
import {
  Modal,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { fonts, theme } from "../theme";
import { ThreadMessage } from "../types";

const DICE = ["d4", "d6", "d8", "d10", "d12", "d20", "d100"];
const SHORTCUTS = ["2d6", "d20+5"];

/** Sheet gutter; the gold seam bleeds back out over it, so they must agree. */
const SHEET_PAD = 18;

/** How long the decorative digit shuffle runs before settling on the real total. */
const SHUFFLE_MS = 400;
const SHUFFLE_TICK_MS = 55;

interface Props {
  visible: boolean;
  onClose: () => void;
  onRoll: (formula: string, label: string) => void;
  /** The most recent roll message in the thread, shown big in the tray. */
  lastRoll: ThreadMessage | null;
  /** Disables the roll buttons (e.g. while the socket is reconnecting). */
  disabled?: boolean;
}

export function DiceTray({ visible, onClose, onRoll, lastRoll, disabled = false }: Props) {
  // Live bounds: the sheet is anchored to the bottom edge, so it owes the
  // gesture bar its inset; the side insets keep it clear of a landscape notch.
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const padLeft = SHEET_PAD + insets.left;
  const padRight = SHEET_PAD + insets.right;
  const narrow = windowWidth < 340;

  // Swipe down anywhere on the sheet header to close.
  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) => g.dy > 12 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderRelease: (_e, g) => {
        if (g.dy > 24) onClose();
      },
    })
  ).current;

  const roll = lastRoll?.roll ?? null;

  // Purely-visual digit shuffle: when a NEW roll message arrives, cycle
  // placeholder digits for ~400ms, then settle on the real server total.
  // The ref is seeded with the mount-time id so reopening the tray (or the
  // app) never replays the shuffle for a roll the table has already seen.
  // setInterval/setTimeout only — no rAF — and the value at rest is always
  // the untouched server total.
  const [shuffleDigits, setShuffleDigits] = useState<string | null>(null);
  const seenRollIdRef = useRef<number | null>(lastRoll?.id ?? null);

  useEffect(() => {
    const id = lastRoll?.id ?? null;
    const total = lastRoll?.roll?.total;
    if (id === null || id === seenRollIdRef.current || total === undefined) return;
    seenRollIdRef.current = id;

    const len = Math.max(1, String(Math.abs(total)).length);
    const spin = () =>
      setShuffleDigits(
        Array.from({ length: len }, (_v, i) =>
          i === 0 && len > 1 ? 1 + Math.floor(Math.random() * 9) : Math.floor(Math.random() * 10)
        ).join("")
      );
    spin();
    const interval = setInterval(spin, SHUFFLE_TICK_MS);
    const timeout = setTimeout(() => {
      clearInterval(interval);
      setShuffleDigits(null);
    }, SHUFFLE_MS);
    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
      setShuffleDigits(null);
    };
  }, [lastRoll]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View
          style={[
            styles.sheet,
            {
              paddingLeft: padLeft,
              paddingRight: padRight,
              paddingBottom: 26 + insets.bottom,
            },
          ]}
        >
          <LinearGradient
            colors={[theme.accentDeep, theme.accentBright, theme.accentDeep]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={[styles.topEdge, { marginLeft: -padLeft, marginRight: -padRight }]}
          />
          <View style={styles.grabberZone} {...pan.panHandlers}>
            <Pressable onPress={onClose} hitSlop={12}>
              <View style={styles.grabber} />
            </Pressable>
            <Text style={styles.title}>{"\u{1F3B2}"} Dice tray</Text>
          </View>

          <View style={styles.result}>
            {roll ? (
              <>
                <Text
                  style={[styles.resultTotal, shuffleDigits !== null && styles.resultTotalRolling]}
                >
                  {shuffleDigits ?? roll.total}
                </Text>
                <Text style={styles.resultLabel} numberOfLines={1} ellipsizeMode="tail">
                  {roll.label} — {roll.actor}
                </Text>
                <Text style={styles.resultDice} numberOfLines={1} ellipsizeMode="tail">
                  {roll.formula} {"→"} [{roll.rolls.join(" ")}]
                  {roll.modifier !== 0
                    ? ` ${roll.modifier > 0 ? `+${roll.modifier}` : roll.modifier}`
                    : ""}
                </Text>
                {roll.outcome && roll.outcome !== String(roll.total) ? (
                  <Text style={styles.resultOutcome} numberOfLines={1}>
                    {roll.outcome}
                  </Text>
                ) : null}
              </>
            ) : (
              <Text style={styles.resultHintText}>
                {disabled
                  ? "Reconnecting to the table…"
                  : "Roll for the table — results post to the thread."}
              </Text>
            )}
          </View>

          <View style={styles.grid}>
            {DICE.map((d) => (
              <Pressable
                key={d}
                disabled={disabled}
                onPress={() => onRoll(d, "Table roll")}
                style={({ pressed }) => [
                  styles.die,
                  narrow && styles.dieNarrow,
                  pressed && styles.diePressed,
                  disabled && styles.dieDisabled,
                ]}
              >
                <Text style={styles.dieText} numberOfLines={1}>
                  {d}
                </Text>
              </Pressable>
            ))}
          </View>
          <View style={styles.shortcutRow}>
            {SHORTCUTS.map((d) => (
              <Pressable
                key={d}
                disabled={disabled}
                onPress={() => onRoll(d, "Table roll")}
                style={({ pressed }) => [
                  styles.shortcut,
                  narrow && styles.shortcutNarrow,
                  pressed && styles.diePressed,
                  disabled && styles.dieDisabled,
                ]}
              >
                <Text style={styles.shortcutText} numberOfLines={1}>
                  {d}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: "flex-end" },
  backdrop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  // Horizontal padding + paddingBottom are supplied per-render (safe-area
  // insets); width/maxWidth keep the sheet inside even a 320pt screen.
  sheet: {
    backgroundColor: theme.panel,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderColor: theme.hairline,
    borderWidth: 1,
    borderBottomWidth: 0,
    width: "100%",
    maxWidth: 520,
    alignSelf: "center",
    overflow: "hidden",
  },
  /** Candle-gold seam along the lip of the tray (bleeds over the gutter). */
  topEdge: { height: 3 },
  grabberZone: { alignItems: "center", paddingTop: 10, paddingBottom: 4 },
  grabber: {
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: theme.accentDeep,
    marginBottom: 10,
  },
  title: {
    color: theme.dim,
    fontSize: 12,
    fontFamily: fonts.display,
    letterSpacing: 2,
    textTransform: "uppercase",
  },

  result: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 108,
    marginVertical: 8,
  },
  resultTotal: {
    color: theme.accentBright,
    fontSize: 56,
    lineHeight: 64,
    fontFamily: fonts.display,
    fontVariant: ["tabular-nums"],
  },
  resultTotalRolling: { color: theme.accent },
  resultLabel: {
    color: theme.text,
    fontSize: 14,
    fontFamily: fonts.speech,
    marginTop: 2,
    alignSelf: "stretch",
    textAlign: "center",
  },
  resultDice: {
    color: theme.dim,
    fontSize: 13,
    marginTop: 3,
    fontVariant: ["tabular-nums"],
    alignSelf: "stretch",
    textAlign: "center",
  },
  resultOutcome: {
    color: theme.ember,
    fontSize: 15,
    fontFamily: fonts.speechBold,
    marginTop: 4,
    alignSelf: "stretch",
    textAlign: "center",
  },
  resultHintText: {
    color: theme.dim,
    fontSize: 14,
    fontFamily: fonts.speechItalic,
    textAlign: "center",
  },

  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 10,
  },
  /** Stone tile: raised face, gold hairline, a darker chiseled base edge. */
  die: {
    width: 62,
    height: 52,
    borderRadius: 12,
    backgroundColor: theme.raised,
    borderColor: theme.hairline,
    borderWidth: 1,
    borderBottomWidth: 3,
    borderBottomColor: theme.bg,
    alignItems: "center",
    justifyContent: "center",
  },
  diePressed: {
    borderColor: theme.accent,
    borderBottomColor: theme.accentDeep,
    backgroundColor: theme.dmBubble,
    transform: [{ translateY: 1 }],
  },
  /** One step down so four tiles per row still clear a 320pt screen. */
  dieNarrow: { width: 56, height: 48 },
  dieDisabled: { opacity: 0.4 },
  dieText: { color: theme.accent, fontSize: 15, fontFamily: fonts.display },
  shortcutRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 10,
    marginTop: 12,
  },
  shortcut: {
    borderRadius: 999,
    backgroundColor: theme.raised,
    borderColor: theme.hairline,
    borderWidth: 1,
    paddingHorizontal: 22,
    paddingVertical: 9,
    flexShrink: 1,
  },
  shortcutNarrow: { paddingHorizontal: 16 },
  shortcutText: { color: theme.text, fontSize: 13, fontFamily: fonts.display },
});
