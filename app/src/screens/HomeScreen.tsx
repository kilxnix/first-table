import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import * as api from "../api";
import { MoodCanvas } from "../components/MoodCanvas";
import { getServerHost, setServerHost } from "../config";
import { fonts, seatColor, theme } from "../theme";

const webNoOutline = Platform.OS === "web" ? ({ outlineStyle: "none" } as any) : null;

const ATTRIBUTION =
  "Includes SRD 5.1 material by Wizards of the Coast LLC, CC-BY-4.0. 5E-compatible.";

/** Decorative party portraits: party data isn't fetched on this screen. */
const PARTY_PORTRAITS = [
  { seat: "seat1", glyph: "\u{1F9D9}" },
  { seat: "seat2", glyph: "\u{1F608}" },
  { seat: "seat3", glyph: "\u{1F54A}\u{FE0F}" },
];

interface Props {
  onEnterTable: (campaignId: number) => void;
}

function formatDate(createdAt: string): string {
  const asNumber = Number(createdAt);
  const d = new Date(Number.isFinite(asNumber) && createdAt !== "" ? asNumber * 1000 : createdAt);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString();
}

export function HomeScreen({ onEnterTable }: Props) {
  const [campaigns, setCampaigns] = useState<api.CampaignListItem[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [editingHost, setEditingHost] = useState(false);
  const [hostDraft, setHostDraft] = useState(getServerHost);

  // Decorative hero entrance + candle-glow pulse. Both start from a visible
  // state so a stalled animation frame (hidden tab) still shows the screen.
  const rise = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(rise, { toValue: 1, friction: 9, tension: 50, useNativeDriver: false }).start();
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 2800, useNativeDriver: false }),
        Animated.timing(pulse, { toValue: 0, duration: 2800, useNativeDriver: false }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [rise, pulse]);

  const heroOpacity = rise.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] });
  const heroShift = rise.interpolate({ inputRange: [0, 1], outputRange: [12, 0] });
  const glowOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.12, 0.22] });
  const glowScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] });

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      setCampaigns(await api.listCampaigns());
    } catch {
      setCampaigns(null);
      setLoadError("Can't reach the server — is it running on port 8000?");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const saveHost = useCallback(async () => {
    const applied = await setServerHost(hostDraft);
    setHostDraft(applied);
    setEditingHost(false);
    load();
  }, [hostDraft, load]);

  const newCampaign = useCallback(async () => {
    if (creating) return;
    setCreating(true);
    try {
      const state = await api.createCampaign("The Goblin Toll");
      onEnterTable(state.id);
    } catch {
      setLoadError("Can't reach the server — is it running on port 8000?");
    } finally {
      setCreating(false);
    }
  }, [creating, onEnterTable]);

  return (
    <View style={styles.screen}>
      <MoodCanvas mood="dusk" />
      <ScrollView contentContainerStyle={styles.content}>
        <Animated.View
          style={[styles.hero, { opacity: heroOpacity, transform: [{ translateY: heroShift }] }]}
        >
          <View style={styles.crestWrap}>
            <Animated.View
              style={[styles.crestGlow, { opacity: glowOpacity, transform: [{ scale: glowScale }] }]}
            />
            <Text style={styles.crest}>{"\u{1F56F}"}️</Text>
          </View>
          <Text style={styles.title}>First Table</Text>
          <Text style={styles.tagline}>Run your first table before you run your first table.</Text>
        </Animated.View>

        <Pressable
          onPress={newCampaign}
          style={({ pressed }) => [styles.newBtn, (pressed || creating) && styles.newBtnPressed]}
        >
          <Text style={styles.newBtnText}>{creating ? "Setting the table…" : "New campaign"}</Text>
        </Pressable>

        {loadError ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{loadError}</Text>
            <Pressable onPress={load} hitSlop={8}>
              <Text style={styles.retryText}>Retry</Text>
            </Pressable>
          </View>
        ) : campaigns === null ? (
          <ActivityIndicator color={theme.accent} style={styles.spinner} />
        ) : campaigns.length > 0 ? (
          <View style={styles.listWrap}>
            <Text style={styles.listLabel}>Your campaigns</Text>
            {campaigns.map((c) => (
              <Pressable
                key={c.id}
                onPress={() => onEnterTable(c.id)}
                style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
              >
                <View style={styles.cardBody}>
                  <Text style={styles.cardName}>{c.name}</Text>
                  <View style={styles.cardMeta}>
                    <View style={styles.portraitRow}>
                      {PARTY_PORTRAITS.map((p, i) => (
                        <View
                          key={p.seat}
                          style={[
                            styles.portrait,
                            { borderColor: seatColor(p.seat) },
                            i > 0 && styles.portraitOverlap,
                          ]}
                        >
                          <Text style={styles.portraitGlyph}>{p.glyph}</Text>
                        </View>
                      ))}
                    </View>
                    <Text style={styles.cardDate}>{formatDate(c.created_at)}</Text>
                  </View>
                </View>
                <Text style={styles.cardChevron}>{"›"}</Text>
              </Pressable>
            ))}
          </View>
        ) : (
          <Text style={styles.emptyText}>
            No campaigns yet. The party is waiting — start one.
          </Text>
        )}
        <View style={styles.serverRow}>
          {editingHost ? (
            <>
              <TextInput
                style={[styles.serverInput, webNoOutline]}
                value={hostDraft}
                onChangeText={setHostDraft}
                onSubmitEditing={saveHost}
                autoFocus
                autoCapitalize="none"
                autoCorrect={false}
                placeholder="192.168.1.20 or host:8000"
                placeholderTextColor={theme.faint}
              />
              <Pressable onPress={saveHost} hitSlop={8}>
                <Text style={styles.serverSave}>Save</Text>
              </Pressable>
            </>
          ) : (
            <Pressable
              onPress={() => {
                setHostDraft(getServerHost());
                setEditingHost(true);
              }}
              hitSlop={8}
            >
              <Text style={styles.serverText}>
                {"⚙"} Table server: {getServerHost()}
              </Text>
            </Pressable>
          )}
        </View>
      </ScrollView>
      <Text style={styles.attribution}>{ATTRIBUTION}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.bg },
  content: { padding: 24, paddingTop: 52, alignItems: "center" },

  hero: { alignItems: "center" },
  crestWrap: { alignItems: "center", justifyContent: "center", marginBottom: 12 },
  crestGlow: {
    position: "absolute",
    width: 92,
    height: 92,
    borderRadius: 46,
    backgroundColor: theme.accent,
  },
  crest: { fontSize: 44 },
  title: {
    color: theme.text,
    fontSize: 34,
    fontFamily: fonts.display,
    letterSpacing: 4,
    textAlign: "center",
  },
  tagline: {
    color: theme.dim,
    fontSize: 15,
    fontFamily: fonts.speechItalic,
    textAlign: "center",
    marginTop: 10,
    marginBottom: 28,
    maxWidth: 300,
    lineHeight: 21,
  },

  newBtn: {
    backgroundColor: theme.accent,
    borderRadius: 999,
    paddingHorizontal: 30,
    paddingVertical: 13,
    marginBottom: 30,
  },
  newBtnPressed: {
    backgroundColor: theme.accentBright,
    shadowColor: theme.accent,
    shadowOpacity: 0.55,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 0 },
  },
  newBtnText: { color: theme.bg, fontSize: 14, fontFamily: fonts.display, letterSpacing: 1 },

  errorBox: {
    alignItems: "center",
    backgroundColor: theme.panel,
    borderColor: theme.hairline,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    alignSelf: "stretch",
  },
  errorText: {
    color: theme.danger,
    fontSize: 14,
    fontFamily: fonts.speech,
    textAlign: "center",
    marginBottom: 8,
  },
  retryText: { color: theme.accent, fontSize: 13, fontFamily: fonts.display, letterSpacing: 0.5 },
  spinner: { marginTop: 8 },

  listWrap: { alignSelf: "stretch" },
  listLabel: {
    color: theme.dim,
    fontSize: 11,
    fontFamily: fonts.display,
    letterSpacing: 2,
    textTransform: "uppercase",
    marginBottom: 8,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.raised,
    borderColor: theme.hairline,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 13,
    marginBottom: 8,
  },
  cardPressed: { borderColor: theme.accent },
  cardBody: { flex: 1 },
  cardName: { color: theme.text, fontSize: 15, fontFamily: fonts.display, letterSpacing: 0.5 },
  cardMeta: { flexDirection: "row", alignItems: "center", marginTop: 7 },
  portraitRow: { flexDirection: "row" },
  portrait: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1.5,
    backgroundColor: theme.panel,
    alignItems: "center",
    justifyContent: "center",
  },
  portraitOverlap: { marginLeft: -7 },
  portraitGlyph: { fontSize: 12 },
  cardDate: { color: theme.faint, fontSize: 12, marginLeft: 10 },
  cardChevron: { color: theme.accentBright, fontSize: 22, marginLeft: 8 },

  emptyText: {
    color: theme.dim,
    fontSize: 14,
    fontFamily: fonts.speechItalic,
    textAlign: "center",
  },

  serverRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 26,
    minHeight: 34,
  },
  serverText: { color: theme.faint, fontSize: 12 },
  serverInput: {
    color: theme.text,
    fontSize: 13,
    backgroundColor: theme.panel,
    borderColor: theme.hairline,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    minWidth: 220,
    marginRight: 10,
  },
  serverSave: { color: theme.accent, fontSize: 13, fontFamily: fonts.display },

  attribution: {
    color: theme.systemText,
    fontSize: 11,
    textAlign: "center",
    paddingHorizontal: 24,
    paddingBottom: 16,
    lineHeight: 16,
  },
});
