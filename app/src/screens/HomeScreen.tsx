import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as api from "../api";
import { theme } from "../theme";

const serif = Platform.select({ ios: "Georgia", android: "serif", default: "Georgia, 'Times New Roman', serif" });

const ATTRIBUTION =
  "Includes SRD 5.1 material by Wizards of the Coast LLC, CC-BY-4.0. 5E-compatible.";

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
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.crest}>{"\u{1F56F}"}️</Text>
        <Text style={styles.title}>First Table</Text>
        <Text style={styles.tagline}>Run your first table before you run your first table.</Text>

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
                  <Text style={styles.cardDate}>{formatDate(c.created_at)}</Text>
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
      </ScrollView>
      <Text style={styles.attribution}>{ATTRIBUTION}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.bg },
  content: { padding: 24, paddingTop: 56, alignItems: "center" },
  crest: { fontSize: 42, marginBottom: 10 },
  title: {
    color: theme.text,
    fontSize: 38,
    fontWeight: "700",
    fontFamily: serif,
    letterSpacing: 0.5,
  },
  tagline: {
    color: theme.dim,
    fontSize: 14,
    fontStyle: "italic",
    textAlign: "center",
    marginTop: 8,
    marginBottom: 28,
    maxWidth: 300,
    lineHeight: 20,
  },

  newBtn: {
    backgroundColor: theme.accent,
    borderRadius: 999,
    paddingHorizontal: 30,
    paddingVertical: 13,
    marginBottom: 28,
  },
  newBtnPressed: { opacity: 0.8 },
  newBtnText: { color: theme.bg, fontSize: 16, fontWeight: "700" },

  errorBox: {
    alignItems: "center",
    backgroundColor: theme.panel,
    borderColor: theme.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    alignSelf: "stretch",
  },
  errorText: { color: theme.danger, fontSize: 13, textAlign: "center", marginBottom: 8 },
  retryText: { color: theme.accent, fontSize: 14, fontWeight: "600" },
  spinner: { marginTop: 8 },

  listWrap: { alignSelf: "stretch" },
  listLabel: {
    color: theme.dim,
    fontSize: 11,
    letterSpacing: 1.5,
    textTransform: "uppercase",
    marginBottom: 8,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.panel,
    borderColor: theme.border,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 8,
  },
  cardPressed: { borderColor: theme.accent },
  cardBody: { flex: 1 },
  cardName: { color: theme.text, fontSize: 16, fontWeight: "600", fontFamily: serif },
  cardDate: { color: theme.dim, fontSize: 12, marginTop: 2 },
  cardChevron: { color: theme.accent, fontSize: 22, marginLeft: 8 },

  emptyText: { color: theme.dim, fontSize: 13, fontStyle: "italic", textAlign: "center" },

  attribution: {
    color: theme.systemText,
    fontSize: 11,
    textAlign: "center",
    paddingHorizontal: 24,
    paddingBottom: 16,
    lineHeight: 16,
  },
});
