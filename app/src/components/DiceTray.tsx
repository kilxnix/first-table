import { useRef } from "react";
import { Modal, PanResponder, Pressable, StyleSheet, Text, View } from "react-native";
import { theme } from "../theme";
import { ThreadMessage } from "../types";

const DICE = ["d4", "d6", "d8", "d10", "d12", "d20", "d100"];
const SHORTCUTS = ["2d6", "d20+5"];

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

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.grabberZone} {...pan.panHandlers}>
            <Pressable onPress={onClose} hitSlop={12}>
              <View style={styles.grabber} />
            </Pressable>
            <Text style={styles.title}>{"\u{1F3B2}"} Dice tray</Text>
          </View>

          <View style={styles.result}>
            {roll ? (
              <>
                <Text style={styles.resultTotal}>{roll.total}</Text>
                <Text style={styles.resultLabel}>
                  {roll.label} — {roll.actor}
                </Text>
                <Text style={styles.resultDice}>
                  {roll.formula} {"→"} [{roll.rolls.join(" ")}]
                  {roll.modifier !== 0
                    ? ` ${roll.modifier > 0 ? `+${roll.modifier}` : roll.modifier}`
                    : ""}
                </Text>
                {roll.outcome ? <Text style={styles.resultOutcome}>{roll.outcome}</Text> : null}
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
                  pressed && styles.diePressed,
                  disabled && styles.dieDisabled,
                ]}
              >
                <Text style={styles.dieText}>{d}</Text>
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
                  pressed && styles.diePressed,
                  disabled && styles.dieDisabled,
                ]}
              >
                <Text style={styles.shortcutText}>{d}</Text>
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
  sheet: {
    backgroundColor: theme.panel,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderColor: theme.border,
    borderWidth: 1,
    borderBottomWidth: 0,
    paddingHorizontal: 18,
    paddingBottom: 26,
    width: "100%",
    maxWidth: 520,
    alignSelf: "center",
  },
  grabberZone: { alignItems: "center", paddingTop: 10, paddingBottom: 4 },
  grabber: {
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: theme.border,
    marginBottom: 10,
  },
  title: { color: theme.dim, fontSize: 13, letterSpacing: 1, textTransform: "uppercase" },

  result: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 96,
    marginVertical: 8,
  },
  resultTotal: { color: theme.accent, fontSize: 46, fontWeight: "800", lineHeight: 52 },
  resultLabel: { color: theme.text, fontSize: 13, marginTop: 2 },
  resultDice: { color: theme.dim, fontSize: 13, marginTop: 2, fontVariant: ["tabular-nums"] },
  resultOutcome: { color: theme.accent, fontSize: 14, fontWeight: "700", marginTop: 3 },
  resultHintText: { color: theme.dim, fontSize: 13, fontStyle: "italic", textAlign: "center" },

  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: 10,
  },
  die: {
    width: 62,
    height: 52,
    borderRadius: 12,
    backgroundColor: theme.card,
    borderColor: theme.border,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  diePressed: { borderColor: theme.accent, backgroundColor: theme.dmBubble },
  dieDisabled: { opacity: 0.4 },
  dieText: { color: theme.accent, fontSize: 16, fontWeight: "700" },
  shortcutRow: { flexDirection: "row", justifyContent: "center", gap: 10, marginTop: 10 },
  shortcut: {
    borderRadius: 999,
    backgroundColor: theme.card,
    borderColor: theme.border,
    borderWidth: 1,
    paddingHorizontal: 22,
    paddingVertical: 9,
  },
  shortcutText: { color: theme.text, fontSize: 14, fontWeight: "600" },
});
