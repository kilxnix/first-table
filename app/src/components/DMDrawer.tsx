import { useEffect, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { theme } from "../theme";
import { BeatView, DMScreenState } from "../types";

const NATIVE = Platform.OS !== "web";
const serif = Platform.select({ ios: "Georgia", android: "serif", default: "Georgia, 'Times New Roman', serif" });
const DRAWER_WIDTH = Math.min(390, Math.round(Dimensions.get("window").width * 0.88));

interface Props {
  visible: boolean;
  onClose: () => void;
  dmScreen: DMScreenState | null;
}

function beatGlyph(status: BeatView["status"]): string {
  if (status === "active") return "●";
  if (status === "done") return "✓";
  return "\u{1F512}";
}

function SectionTitle({ children }: { children: string }) {
  return <Text style={styles.sectionTitle}>{children}</Text>;
}

export function DMDrawer({ visible, onClose, dmScreen }: Props) {
  const [mounted, setMounted] = useState(visible);
  const progress = useRef(new Animated.Value(visible ? 1 : 0)).current;

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

  const translateX = progress.interpolate({ inputRange: [0, 1], outputRange: [DRAWER_WIDTH, 0] });

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
      <Animated.View style={[styles.drawer, { width: DRAWER_WIDTH, transform: [{ translateX }] }]}>
        <View style={styles.drawerHeader}>
          <Pressable onPress={onClose} hitSlop={10} style={styles.closeHandle}>
            <Text style={styles.closeText}>{"‹"} close</Text>
          </Pressable>
          <Text style={styles.drawerTitle}>DM Screen — private</Text>
        </View>

        {dmScreen ? (
          <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
            <Text style={styles.spineTitle}>{dmScreen.spine_title}</Text>

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
                <Text style={styles.clockName}>{clock.name}</Text>
                <Text style={styles.clockPips}>
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
                  <Text style={styles.npcName}>{npc.name}</Text>
                  <Text style={styles.npcStatus}>{npc.status}</Text>
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
              return (
                <View key={member.seat} style={styles.partyRow}>
                  <Text style={styles.partyName}>{member.name}</Text>
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
                </View>
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
  drawerHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomColor: theme.border,
    borderBottomWidth: 1,
    backgroundColor: theme.panel,
  },
  closeHandle: { marginRight: 12 },
  closeText: { color: theme.dim, fontSize: 14 },
  drawerTitle: {
    color: theme.accent,
    fontSize: 15,
    fontWeight: "700",
    fontFamily: serif,
    letterSpacing: 0.4,
  },

  scroll: { flex: 1 },
  scrollContent: { padding: 14, paddingBottom: 32 },
  spineTitle: { color: theme.text, fontSize: 19, fontWeight: "700", fontFamily: serif, marginBottom: 4 },
  sectionTitle: {
    color: theme.dim,
    fontSize: 11,
    letterSpacing: 1.5,
    textTransform: "uppercase",
    marginTop: 18,
    marginBottom: 8,
  },

  beat: { marginBottom: 8 },
  beatHead: { flexDirection: "row", alignItems: "center" },
  beatGlyph: { color: theme.dim, fontSize: 13, width: 22 },
  beatGlyphActive: { color: theme.accent },
  beatTitle: { color: theme.text, fontSize: 15, fontWeight: "600" },
  beatTitleLocked: { color: theme.dim },
  beatBody: {
    marginLeft: 22,
    marginTop: 6,
    paddingLeft: 10,
    borderLeftColor: theme.border,
    borderLeftWidth: 2,
  },
  beatNotes: { color: theme.text, fontSize: 13, lineHeight: 19, marginBottom: 6 },
  secret: { color: theme.dim, fontSize: 13, lineHeight: 19, marginBottom: 3 },

  clockRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: theme.panel,
    borderColor: theme.border,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginBottom: 6,
  },
  clockName: { color: theme.text, fontSize: 14 },
  clockPips: { fontSize: 14, letterSpacing: 3 },
  clockFilled: { color: theme.danger },
  clockEmpty: { color: theme.dim },

  npcCard: {
    backgroundColor: theme.card,
    borderColor: theme.border,
    borderWidth: 1,
    borderRadius: 10,
    padding: 11,
    marginBottom: 8,
  },
  npcHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
  npcName: { color: theme.text, fontSize: 15, fontWeight: "700" },
  npcStatus: { color: theme.dim, fontSize: 12 },
  npcVoice: { color: theme.dim, fontSize: 13, fontStyle: "italic", marginTop: 3, lineHeight: 18 },
  npcSecret: { color: theme.accent, fontSize: 13, marginTop: 5, lineHeight: 18 },

  partyRow: { marginBottom: 10 },
  partyName: { color: theme.text, fontSize: 14, fontWeight: "600", marginBottom: 4 },
  hpTrack: {
    height: 7,
    borderRadius: 4,
    backgroundColor: theme.border,
    overflow: "hidden",
  },
  hpFill: { height: "100%", borderRadius: 4 },
  hpText: { color: theme.dim, fontSize: 12, marginTop: 3 },
  conditions: { color: theme.danger, fontSize: 12, marginTop: 2 },

  emptyWrap: { flex: 1, alignItems: "center", justifyContent: "center" },
  emptyText: { color: theme.dim, fontSize: 13, fontStyle: "italic" },
});
