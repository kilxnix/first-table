import { useEffect, useRef } from "react";
import { Animated, Platform, StyleSheet, Text, View } from "react-native";
import { fonts, seatColor, theme } from "../theme";
import { ThreadMessage } from "../types";

const NATIVE = Platform.OS !== "web";

interface Props {
  message: ThreadMessage;
  /** Portrait emoji for the speaking seat (agent messages). */
  portrait?: string;
  /** True when the previous message came from the same agent — tightens spacing, hides avatar+name. */
  grouped?: boolean;
}

function formatRollDetail(formula: string, rolls: number[], modifier: number): string {
  const dice = `[${rolls.join(" ")}]`;
  const mod = modifier === 0 ? "" : ` ${modifier > 0 ? `+${modifier}` : `${modifier}`}`;
  return `${formula} → ${dice}${mod}`;
}

/**
 * Decorative mount motion: every message fades in and rises 8px, once. Message
 * identity is keyed upstream (ChatThread keys by id), so this never re-fires
 * on list re-renders.
 */
function useMountRise() {
  const rise = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(rise, {
      toValue: 1,
      friction: 9,
      tension: 90,
      useNativeDriver: NATIVE,
    }).start();
  }, [rise]);
  return {
    opacity: rise.interpolate({ inputRange: [0, 1], outputRange: [0, 1], extrapolate: "clamp" as const }),
    transform: [{ translateY: rise.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }],
  };
}

export function MessageBubble({ message, portrait, grouped = false }: Props) {
  const mount = useMountRise();

  if (message.kind === "system") {
    // Beat transitions read as chapter dividers — a candlelit table of contents.
    const beat = message.text ? message.text.match(/\[Beat:\s*([^\]]+)\]/) : null;
    if (beat) {
      return (
        <Animated.View style={[styles.beatRow, styles.beatSpaced, mount]}>
          <View style={styles.beatLine} />
          <Text style={styles.beatStar}>{"✦"}</Text>
          <Text style={styles.beatTitle} numberOfLines={1}>
            {beat[1]}
          </Text>
          <Text style={styles.beatStar}>{"✦"}</Text>
          <View style={styles.beatLine} />
        </Animated.View>
      );
    }
    return (
      <Animated.View style={[styles.systemRow, styles.spaced, mount]}>
        <Text style={styles.systemText}>{message.text}</Text>
      </Animated.View>
    );
  }

  if (message.kind === "roll" && message.roll) {
    const r = message.roll;
    const nat20 = r.rolls[0] === 20;
    const nat1 = r.rolls[0] === 1;
    return (
      <Animated.View style={[styles.rollRow, styles.spaced, mount]}>
        <View style={styles.rollCard}>
          <Text style={styles.rollHeader} numberOfLines={1}>
            {"\u{1F3B2}"} {r.label} {"·"} {r.actor}
          </Text>
          <Text
            style={[styles.rollTotal, nat20 && styles.rollTotalBlessed, nat1 && styles.rollTotalCursed]}
          >
            {r.total}
          </Text>
          <Text style={styles.rollLine}>{formatRollDetail(r.formula, r.rolls, r.modifier)}</Text>
          {/* outcome that just repeats the hero total (plain checks) adds nothing */}
          {r.outcome && r.outcome !== String(r.total) ? (
            <Text style={styles.rollOutcome}>{r.outcome}</Text>
          ) : null}
        </View>
      </Animated.View>
    );
  }

  if (message.kind === "dm") {
    return (
      <Animated.View style={[styles.dmRow, styles.spaced, mount]}>
        <View style={styles.dmBubble}>
          <Text style={styles.dmText}>{message.text}</Text>
        </View>
      </Animated.View>
    );
  }

  // Agent message: avatar + name label, speech serif, action italic, ooc faint.
  const accent = seatColor(message.seat);
  return (
    <Animated.View style={[styles.agentRow, grouped ? styles.groupedSpacing : styles.spaced, mount]}>
      <View style={styles.avatarSlot}>
        {!grouped && (
          <View style={[styles.avatar, { borderColor: accent }]}>
            <Text style={styles.avatarEmoji}>{portrait ?? "\u{1F3AD}"}</Text>
          </View>
        )}
      </View>
      <View style={[styles.agentBubble, grouped && styles.agentBubbleGrouped]}>
        {!grouped && message.name ? (
          <Text style={[styles.name, { color: accent }]}>{message.name}</Text>
        ) : null}
        {message.speech ? <Text style={styles.speech}>{message.speech}</Text> : null}
        {message.action ? <Text style={styles.action}>*{message.action}*</Text> : null}
        {message.ooc ? <Text style={styles.ooc}>(ooc) {message.ooc}</Text> : null}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  spaced: { marginTop: 12 },
  groupedSpacing: { marginTop: 3 },

  // system
  systemRow: { alignItems: "center", paddingHorizontal: 24 },
  systemText: {
    color: theme.systemText,
    fontFamily: fonts.speechItalic,
    fontSize: 12.5,
    textAlign: "center",
    lineHeight: 18,
  },

  // beat divider
  beatSpaced: { marginTop: 20, marginBottom: 4 },
  beatRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 18,
  },
  beatLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: "rgba(224, 168, 63, 0.45)",
  },
  beatStar: {
    color: theme.accentDeep,
    fontSize: 10,
    marginHorizontal: 8,
  },
  beatTitle: {
    color: theme.accent,
    fontFamily: fonts.displayLight,
    fontSize: 13,
    letterSpacing: 2,
    maxWidth: "70%",
  },

  // roll — the dice slate
  rollRow: { alignItems: "center" },
  rollCard: {
    backgroundColor: theme.raised,
    borderColor: "rgba(224, 168, 63, 0.4)",
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 18,
    paddingVertical: 10,
    alignItems: "center",
    minWidth: 200,
    maxWidth: "88%",
    shadowColor: "#000",
    shadowOpacity: 0.35,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  rollHeader: {
    color: theme.dim,
    fontFamily: fonts.display,
    fontSize: 10,
    letterSpacing: 1.5,
    marginBottom: 2,
  },
  rollTotal: {
    color: theme.text,
    fontFamily: fonts.display,
    fontSize: 34,
    lineHeight: 42,
    fontVariant: ["tabular-nums"],
  },
  rollTotalBlessed: {
    color: theme.accentBright,
    textShadowColor: "rgba(242, 193, 100, 0.75)",
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 14,
  },
  rollTotalCursed: {
    color: theme.danger,
    textShadowColor: "rgba(192, 80, 63, 0.6)",
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 10,
  },
  rollLine: {
    color: theme.dim,
    fontSize: 12.5,
    fontVariant: ["tabular-nums"],
    marginTop: 2,
  },
  rollOutcome: {
    color: theme.accent,
    fontFamily: fonts.speechItalic,
    fontSize: 14.5,
    marginTop: 4,
  },

  // dm — gold left hairline, the narrator's margin rule
  dmRow: { flexDirection: "row", justifyContent: "flex-end" },
  dmBubble: {
    backgroundColor: theme.dmBubble,
    borderLeftColor: theme.accent,
    borderLeftWidth: 2,
    borderRadius: 14,
    borderTopLeftRadius: 4,
    borderBottomLeftRadius: 4,
    borderBottomRightRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 9,
    maxWidth: "82%",
  },
  dmText: {
    color: theme.text,
    fontFamily: fonts.speech,
    fontSize: 15.5,
    lineHeight: 22,
  },

  // agent
  agentRow: { flexDirection: "row", alignItems: "flex-end" },
  avatarSlot: { width: 34, marginRight: 8 },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: theme.panel,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarEmoji: { fontSize: 17 },
  agentBubble: {
    backgroundColor: theme.agentBubble,
    borderColor: theme.hairline,
    borderWidth: 1,
    borderRadius: 16,
    borderBottomLeftRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 9,
    maxWidth: "78%",
  },
  agentBubbleGrouped: { borderBottomLeftRadius: 16, borderTopLeftRadius: 6 },
  name: {
    fontFamily: fonts.display,
    fontSize: 11.5,
    letterSpacing: 1.2,
    marginBottom: 3,
  },
  speech: {
    color: theme.text,
    fontFamily: fonts.speech,
    fontSize: 15.5,
    lineHeight: 22,
  },
  action: {
    color: theme.dim,
    fontFamily: fonts.speechItalic,
    fontSize: 14.5,
    lineHeight: 20,
    marginTop: 3,
  },
  ooc: {
    color: theme.faint,
    fontFamily: fonts.speech,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 4,
  },
});
