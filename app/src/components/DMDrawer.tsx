import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useRef, useState } from "react";
import {
  Animated,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { fonts, seatColor, theme } from "../theme";
import { BeatView, DMScreenState, PartyMember } from "../types";

const NATIVE = Platform.OS !== "web";
/** Roomy but never wider than the screen it slides over. */
const MAX_DRAWER_WIDTH = 390;

interface Props {
  visible: boolean;
  onClose: () => void;
  dmScreen: DMScreenState | null;
  /** Full party members (for the tap-to-peek sheet: stats + AC). */
  party?: PartyMember[];
}

function beatGlyph(status: BeatView["status"]): string {
  if (status === "active") return "●";
  if (status === "done") return "✓";
  return "\u{1F512}";
}

function SectionTitle({ children }: { children: string }) {
  return (
    <Text style={styles.sectionTitle}>
      <Text style={styles.sectionStar}>{"✦"} </Text>
      {children}
    </Text>
  );
}

export function DMDrawer({ visible, onClose, dmScreen, party }: Props) {
  const [mounted, setMounted] = useState(visible);
  const [peekSeat, setPeekSeat] = useState<string | null>(null);
  const progress = useRef(new Animated.Value(visible ? 1 : 0)).current;
  // Recomputed every render from the live window, so a rotation can never
  // leave the drawer wider than the screen (or parked half-open off it).
  const { width: windowWidth } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const drawerWidth = Math.min(MAX_DRAWER_WIDTH, windowWidth, Math.round(windowWidth * 0.88));
  const narrowDrawer = drawerWidth < 320;

  useEffect(() => {
    if (visible) {
      setMounted(true);
      Animated.spring(progress, {
        toValue: 1,
        friction: 11,
        tension: 90,
        useNativeDriver: NATIVE,
      }).start();
    } else {
      Animated.timing(progress, { toValue: 0, duration: 200, useNativeDriver: NATIVE }).start(
        ({ finished }) => finished && setMounted(false)
      );
    }
  }, [visible, progress]);

  if (!mounted) return null;

  const translateX = progress.interpolate({ inputRange: [0, 1], outputRange: [drawerWidth, 0] });

  return (
    // pointerEvents gated on `visible`, not on the animation: the close
    // animation is rAF-driven and can stall (hidden tabs), and a mounted
    // invisible backdrop must never swallow the app's clicks.
    <View style={StyleSheet.absoluteFill} pointerEvents={visible ? "box-none" : "none"}>
      <Animated.View
        style={[styles.backdrop, { opacity: progress }]}
        pointerEvents={visible ? "auto" : "none"}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>
      <Animated.View style={[styles.drawer, { width: drawerWidth, transform: [{ translateX }] }]}>
        <LinearGradient
          colors={[theme.panel, theme.bg]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={StyleSheet.absoluteFill}
        />
        <View
          style={[
            styles.drawerHeader,
            { paddingTop: 13 + insets.top, paddingRight: 14 + insets.right },
          ]}
        >
          <Pressable onPress={onClose} hitSlop={10} style={styles.closeHandle}>
            <Text style={styles.closeText} numberOfLines={1}>
              {"‹"} close
            </Text>
          </Pressable>
          <Text
            style={[styles.drawerTitle, narrowDrawer && styles.drawerTitleNarrow]}
            numberOfLines={1}
          >
            <Text style={styles.drawerTitleStar}>{"✦"} </Text>
            DM Screen — private
          </Text>
        </View>

        {dmScreen ? (
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={[
              styles.scrollContent,
              { paddingRight: 14 + insets.right, paddingBottom: 32 + insets.bottom },
            ]}
          >
            <Text style={styles.spineTitle} numberOfLines={2}>
              {dmScreen.spine_title}
            </Text>

            <SectionTitle>Beats</SectionTitle>
            {dmScreen.beats.map((beat) => (
              <View key={beat.id} style={styles.beat}>
                <View style={styles.beatHead}>
                  <Text
                    style={[styles.beatGlyph, beat.status === "active" && styles.beatGlyphActive]}
                  >
                    {beatGlyph(beat.status)}
                  </Text>
                  <Text
                    style={[styles.beatTitle, beat.status === "locked" && styles.beatTitleLocked]}
                    numberOfLines={2}
                  >
                    {beat.title}
                  </Text>
                </View>
                {beat.status === "active" && (
                  <View style={styles.beatBody}>
                    <Text style={styles.beatNotes}>{beat.dm_notes}</Text>
                    {beat.secrets.map((secret, i) => (
                      <Text key={i} style={styles.secret}>
                        {"– "}
                        {secret}
                      </Text>
                    ))}
                  </View>
                )}
              </View>
            ))}

            <SectionTitle>Clocks</SectionTitle>
            {dmScreen.clocks.map((clock) => (
              <View key={clock.name} style={styles.clockRow}>
                <Text style={styles.clockName} numberOfLines={1}>
                  {clock.name}
                </Text>
                <Text style={styles.clockPips} numberOfLines={1}>
                  <Text style={styles.clockFilled}>{"●".repeat(clock.filled)}</Text>
                  <Text style={styles.clockEmpty}>
                    {"○".repeat(Math.max(0, clock.segments - clock.filled))}
                  </Text>
                </Text>
              </View>
            ))}

            <SectionTitle>NPCs</SectionTitle>
            {dmScreen.npcs.map((npc) => (
              <View key={npc.name} style={styles.npcCard}>
                <View style={styles.npcHead}>
                  <Text style={styles.npcName} numberOfLines={1}>
                    {npc.name}
                  </Text>
                  <Text style={styles.npcStatus} numberOfLines={1}>
                    {npc.status}
                  </Text>
                </View>
                <Text style={styles.npcVoice}>{npc.voice_note}</Text>
                <Text style={styles.npcSecret}>
                  {"\u{1F92B}"} {npc.secret}
                </Text>
              </View>
            ))}

            <SectionTitle>Party</SectionTitle>
            {dmScreen.party_status.map((member) => {
              const frac = member.max_hp > 0 ? member.hp / member.max_hp : 0;
              const peeking = peekSeat === member.seat;
              const full = party?.find((p) => p.seat === member.seat);
              return (
                <Pressable
                  key={member.seat}
                  onPress={() => setPeekSeat(peeking ? null : member.seat)}
                  style={styles.partyRow}
                >
                  <View style={styles.partyHead}>
                    <Text
                      style={[styles.partyName, { color: seatColor(member.seat) }]}
                      numberOfLines={1}
                    >
                      {member.name}
                    </Text>
                    <Text style={styles.peekHint}>{peeking ? "▾" : "▸"}</Text>
                  </View>
                  <View style={styles.hpTrack}>
                    <View
                      style={[
                        styles.hpFill,
                        {
                          width: `${Math.round(Math.max(0, Math.min(1, frac)) * 100)}%`,
                          backgroundColor: frac <= 0.35 ? theme.danger : theme.accent,
                        },
                      ]}
                    />
                  </View>
                  <Text style={styles.hpText}>
                    {member.hp}/{member.max_hp}
                  </Text>
                  {member.conditions.length > 0 && (
                    <Text style={styles.conditions}>{member.conditions.join(", ")}</Text>
                  )}
                  {peeking && (
                    <View style={styles.peek}>
                      {full && (
                        <Text style={styles.peekStats}>
                          {Object.entries(full.stats)
                            .map(([k, v]) => `${k.toUpperCase()} ${v}`)
                            .join(" · ")}
                          {`  ·  AC ${full.ac}`}
                        </Text>
                      )}
                      {member.inventory.length > 0 && (
                        <Text style={styles.peekInventory}>
                          {"\u{1F392}"} {member.inventory.join(" · ")}
                        </Text>
                      )}
                    </View>
                  )}
                </Pressable>
              );
            })}
          </ScrollView>
        ) : (
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyText}>Connecting to the table…</Text>
          </View>
        )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  drawer: {
    position: "absolute",
    top: 0,
    bottom: 0,
    right: 0,
    backgroundColor: theme.bg,
    borderLeftColor: theme.accent,
    borderLeftWidth: 2,
  },
  // paddingTop / paddingRight are supplied per-render (top + right insets).
  drawerHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: 14,
    paddingBottom: 13,
    borderBottomColor: theme.hairline,
    borderBottomWidth: 1,
  },
  closeHandle: { marginRight: 12, flexShrink: 0 },
  closeText: { color: theme.dim, fontSize: 13 },
  drawerTitle: {
    color: theme.accent,
    fontSize: 13,
    fontFamily: fonts.display,
    letterSpacing: 1.5,
    textTransform: "uppercase",
    flexShrink: 1,
    minWidth: 0,
  },
  /** One step tighter so the label still reads whole on a 320pt phone. */
  drawerTitleNarrow: { fontSize: 12, letterSpacing: 0.8 },
  drawerTitleStar: { color: theme.accentBright },

  scroll: { flex: 1 },
  // paddingRight / paddingBottom are supplied per-render (right + bottom insets).
  scrollContent: { paddingLeft: 14, paddingTop: 14 },
  spineTitle: {
    color: theme.text,
    fontSize: 18,
    fontFamily: fonts.display,
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  sectionTitle: {
    color: theme.dim,
    fontSize: 11,
    fontFamily: fonts.display,
    letterSpacing: 2,
    textTransform: "uppercase",
    marginTop: 20,
    marginBottom: 8,
  },
  sectionStar: { color: theme.accentDeep },

  beat: { marginBottom: 8 },
  beatHead: { flexDirection: "row", alignItems: "center" },
  beatGlyph: { color: theme.faint, fontSize: 13, width: 22, flexShrink: 0 },
  beatGlyphActive: { color: theme.accentBright },
  beatTitle: {
    color: theme.text,
    fontSize: 14,
    fontFamily: fonts.display,
    letterSpacing: 0.3,
    flexShrink: 1,
    minWidth: 0,
  },
  beatTitleLocked: { color: theme.faint },
  beatBody: {
    marginLeft: 22,
    marginTop: 6,
    paddingLeft: 10,
    borderLeftColor: theme.hairline,
    borderLeftWidth: 2,
  },
  beatNotes: {
    color: theme.text,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: fonts.speech,
    marginBottom: 6,
  },
  secret: {
    color: theme.dim,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: fonts.speechItalic,
    marginBottom: 3,
  },

  clockRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: theme.raised,
    borderColor: theme.hairline,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginBottom: 6,
  },
  clockName: {
    color: theme.text,
    fontSize: 14,
    fontFamily: fonts.speech,
    flexShrink: 1,
    minWidth: 0,
  },
  clockPips: { fontSize: 16, letterSpacing: 3.5, flexShrink: 0, marginLeft: 8 },
  clockFilled: { color: theme.danger },
  clockEmpty: { color: theme.faint },

  npcCard: {
    backgroundColor: theme.raised,
    borderColor: theme.hairline,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
  },
  npcHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
  npcName: {
    color: theme.text,
    fontSize: 14,
    fontFamily: fonts.display,
    letterSpacing: 0.3,
    flexShrink: 1,
    minWidth: 0,
  },
  // Capped so a wordy status can never crowd the name off its own card.
  npcStatus: { color: theme.dim, fontSize: 12, flexShrink: 0, maxWidth: "45%", marginLeft: 8 },
  npcVoice: {
    color: theme.dim,
    fontSize: 14,
    fontFamily: fonts.speechItalic,
    marginTop: 3,
    lineHeight: 19,
  },
  npcSecret: {
    color: theme.accent,
    fontSize: 14,
    fontFamily: fonts.speech,
    marginTop: 6,
    lineHeight: 19,
  },

  partyRow: { marginBottom: 12 },
  partyHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  partyName: {
    fontSize: 13,
    fontFamily: fonts.display,
    letterSpacing: 0.5,
    marginBottom: 4,
    flexShrink: 1,
    minWidth: 0,
  },
  peekHint: { color: theme.faint, fontSize: 12, flexShrink: 0, marginLeft: 8 },
  peek: {
    marginTop: 6,
    paddingLeft: 10,
    borderLeftColor: theme.hairline,
    borderLeftWidth: 2,
  },
  peekStats: {
    color: theme.dim,
    fontSize: 13,
    lineHeight: 19,
    fontFamily: fonts.speech,
    fontVariant: ["tabular-nums"],
  },
  peekInventory: {
    color: theme.text,
    fontSize: 13,
    lineHeight: 19,
    fontFamily: fonts.speech,
    marginTop: 3,
  },
  hpTrack: {
    height: 7,
    borderRadius: 4,
    backgroundColor: theme.border,
    overflow: "hidden",
  },
  hpFill: { height: "100%", borderRadius: 4 },
  hpText: { color: theme.dim, fontSize: 12, marginTop: 3, fontVariant: ["tabular-nums"] },
  conditions: { color: theme.danger, fontSize: 12, marginTop: 2 },

  emptyWrap: { flex: 1, alignItems: "center", justifyContent: "center" },
  emptyText: { color: theme.dim, fontSize: 14, fontFamily: fonts.speechItalic },
});
