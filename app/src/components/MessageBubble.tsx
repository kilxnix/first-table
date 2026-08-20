import { StyleSheet, Text, View } from "react-native";
import { theme } from "../theme";
import { ThreadMessage } from "../types";

interface Props {
  message: ThreadMessage;
  /** Portrait emoji for the speaking seat (agent messages). */
  portrait?: string;
  /** True when the previous message came from the same agent — tightens spacing, hides avatar+name. */
  grouped?: boolean;
}

function formatRollLine(rolls: number[], modifier: number, total: number): string {
  const dice = `[${rolls.join(" ")}]`;
  const mod = modifier === 0 ? "" : ` ${modifier > 0 ? `+${modifier}` : `${modifier}`}`;
  return `${dice}${mod} = ${total}`;
}

export function MessageBubble({ message, portrait, grouped = false }: Props) {
  if (message.kind === "system") {
    return (
      <View style={[styles.systemRow, styles.spaced]}>
        <Text style={styles.systemText}>{message.text}</Text>
      </View>
    );
  }

  if (message.kind === "roll" && message.roll) {
    const r = message.roll;
    return (
      <View style={[styles.rollRow, styles.spaced]}>
        <View style={styles.rollCard}>
          <Text style={styles.rollHeader}>
            {"\u{1F3B2}"} {r.label} — {r.actor}
          </Text>
          <Text style={styles.rollLine}>
            {r.formula} {"→"} {formatRollLine(r.rolls, r.modifier, r.total)}
          </Text>
          {r.outcome ? <Text style={styles.rollOutcome}>{r.outcome}</Text> : null}
        </View>
      </View>
    );
  }

  if (message.kind === "dm") {
    return (
      <View style={[styles.dmRow, styles.spaced]}>
        <View style={styles.dmBubble}>
          <Text style={styles.dmText}>{message.text}</Text>
        </View>
      </View>
    );
  }

  // Agent message: avatar + name label, speech plain, action italic, ooc gray.
  return (
    <View style={[styles.agentRow, grouped ? styles.groupedSpacing : styles.spaced]}>
      <View style={styles.avatarSlot}>
        {!grouped && (
          <View style={styles.avatar}>
            <Text style={styles.avatarEmoji}>{portrait ?? "\u{1F3AD}"}</Text>
          </View>
        )}
      </View>
      <View style={[styles.agentBubble, grouped && styles.agentBubbleGrouped]}>
        {!grouped && message.name ? <Text style={styles.name}>{message.name}</Text> : null}
        {message.speech ? <Text style={styles.speech}>{message.speech}</Text> : null}
        {message.action ? <Text style={styles.action}>*{message.action}*</Text> : null}
        {message.ooc ? <Text style={styles.ooc}>(ooc) {message.ooc}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  spaced: { marginTop: 12 },
  groupedSpacing: { marginTop: 3 },

  // system
  systemRow: { alignItems: "center", paddingHorizontal: 24 },
  systemText: {
    color: theme.systemText,
    fontSize: 12,
    fontStyle: "italic",
    textAlign: "center",
    lineHeight: 17,
  },

  // roll
  rollRow: { alignItems: "center" },
  rollCard: {
    backgroundColor: theme.card,
    borderColor: theme.border,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 8,
    alignItems: "center",
    minWidth: 190,
    maxWidth: "88%",
  },
  rollHeader: { color: theme.dim, fontSize: 12, marginBottom: 2 },
  rollLine: { color: theme.text, fontSize: 15, fontVariant: ["tabular-nums"] },
  rollOutcome: { color: theme.accent, fontSize: 15, fontWeight: "700", marginTop: 2 },

  // dm
  dmRow: { flexDirection: "row", justifyContent: "flex-end" },
  dmBubble: {
    backgroundColor: theme.dmBubble,
    borderRadius: 16,
    borderBottomRightRadius: 4,
    paddingHorizontal: 13,
    paddingVertical: 8,
    maxWidth: "82%",
  },
  dmText: { color: theme.text, fontSize: 15, lineHeight: 21 },

  // agent
  agentRow: { flexDirection: "row", alignItems: "flex-end" },
  avatarSlot: { width: 32, marginRight: 8 },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: theme.panel,
    borderColor: theme.border,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarEmoji: { fontSize: 17 },
  agentBubble: {
    backgroundColor: theme.agentBubble,
    borderColor: theme.border,
    borderWidth: 1,
    borderRadius: 16,
    borderBottomLeftRadius: 4,
    paddingHorizontal: 13,
    paddingVertical: 8,
    maxWidth: "78%",
  },
  agentBubbleGrouped: { borderBottomLeftRadius: 16, borderTopLeftRadius: 6 },
  name: { color: theme.accent, fontSize: 12, fontWeight: "700", marginBottom: 2, letterSpacing: 0.3 },
  speech: { color: theme.text, fontSize: 15, lineHeight: 21 },
  action: { color: theme.dim, fontSize: 14, lineHeight: 20, fontStyle: "italic", marginTop: 3 },
  ooc: { color: theme.dim, fontSize: 13, lineHeight: 18, marginTop: 4, opacity: 0.85 },
});
