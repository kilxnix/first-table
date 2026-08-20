import { useCallback, useState } from "react";
import {
  Dimensions,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { theme } from "../theme";
import { AxisScore, Report } from "../types";

const serif = Platform.select({ ios: "Georgia", android: "serif", default: "Georgia, 'Times New Roman', serif" });

interface Props {
  report: Report;
  onDone: () => void;
}

type Card =
  | { key: string; kind: "axis"; title: string; axis: AxisScore }
  | { key: string; kind: "coach" };

function scoreColor(score: number): string {
  if (score >= 70) return theme.accent;
  if (score < 40) return theme.danger;
  return theme.text;
}

// Fallback for environments where onLayout is delayed or never fires
// (e.g. hidden tabs): the app column is capped at 520 wide in App.tsx.
const FALLBACK_WIDTH = Math.min(Dimensions.get("window").width, 520);

export function ReportCardScreen({ report, onDone }: Props) {
  const [measured, setMeasured] = useState(0);
  const width = measured > 0 ? measured : FALLBACK_WIDTH;
  const [page, setPage] = useState(0);

  const cards: Card[] = [
    { key: "spotlight", kind: "axis", title: "Spotlight", axis: report.axes.spotlight },
    { key: "pacing", kind: "axis", title: "Pacing", axis: report.axes.pacing },
    { key: "coach", kind: "coach" },
  ];

  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (width > 0) setPage(Math.round(e.nativeEvent.contentOffset.x / width));
    },
    [width]
  );

  const renderCard = useCallback(
    ({ item }: { item: Card }) => (
      <View style={[styles.card, { width }]}>
        {item.kind === "axis" ? (
          <View style={styles.cardInner}>
            <Text style={styles.axisTitle}>{item.title}</Text>
            <View style={styles.scoreRow}>
              <Text style={[styles.score, { color: scoreColor(item.axis.score) }]}>
                {item.axis.score}
              </Text>
              <Text style={styles.scoreOutOf}>/100</Text>
            </View>
            <Text style={styles.detail}>{item.axis.detail}</Text>
            <Text style={styles.swipeHint}>swipe {"›"}</Text>
          </View>
        ) : (
          <View style={styles.cardInner}>
            <Text style={styles.axisTitle}>Coach{"'"}s corner</Text>
            <View style={styles.notes}>
              {report.notes.map((note, i) => (
                <Text key={i} style={styles.note}>
                  {note}
                </Text>
              ))}
            </View>
            <View style={styles.drillBox}>
              <Text style={styles.drillLabel}>Next drill</Text>
              <Text style={styles.drillText}>{report.drill_suggestion}</Text>
            </View>
            <Pressable
              onPress={onDone}
              style={({ pressed }) => [styles.doneBtn, pressed && styles.doneBtnPressed]}
            >
              <Text style={styles.doneBtnText}>Back to the table</Text>
            </Pressable>
          </View>
        )}
      </View>
    ),
    [width, report, onDone]
  );

  return (
    <View style={styles.screen} onLayout={(e) => setMeasured(e.nativeEvent.layout.width)}>
      <Text style={styles.header}>Scene report</Text>
      <Text style={styles.subHeader}>Scene {report.scene_id}</Text>
      {/* Plain ScrollView, not FlatList: three static cards need no
          virtualization, and react-native-web's VirtualizedList has proven
          unreliable (see ChatThread). */}
      <ScrollView
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={32}
        style={styles.pager}
      >
        {cards.map((item) => (
          <View key={item.key} style={{ width }}>
            {renderCard({ item })}
          </View>
        ))}
      </ScrollView>
      <View style={styles.dots}>
        {cards.map((c, i) => (
          <View key={c.key} style={[styles.dot, i === page && styles.dotActive]} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.bg, paddingTop: 26 },
  pager: { flex: 1 },
  header: {
    color: theme.dim,
    fontSize: 12,
    letterSpacing: 2,
    textTransform: "uppercase",
    textAlign: "center",
  },
  subHeader: {
    color: theme.text,
    fontSize: 20,
    fontWeight: "700",
    fontFamily: serif,
    textAlign: "center",
    marginTop: 4,
    marginBottom: 8,
  },

  card: { flex: 1, padding: 22, justifyContent: "center" },
  cardInner: {
    backgroundColor: theme.panel,
    borderColor: theme.border,
    borderWidth: 1,
    borderRadius: 20,
    padding: 24,
    alignItems: "center",
  },
  axisTitle: {
    color: theme.dim,
    fontSize: 13,
    letterSpacing: 2,
    textTransform: "uppercase",
    marginBottom: 8,
  },
  scoreRow: { flexDirection: "row", alignItems: "baseline" },
  score: { fontSize: 76, fontWeight: "800", lineHeight: 84 },
  scoreOutOf: { color: theme.dim, fontSize: 18, marginLeft: 4 },
  detail: {
    color: theme.text,
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
    marginTop: 14,
  },
  swipeHint: { color: theme.dim, fontSize: 12, marginTop: 20, fontStyle: "italic" },

  notes: { alignSelf: "stretch", marginBottom: 16 },
  note: {
    color: theme.text,
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 8,
    textAlign: "center",
  },
  drillBox: {
    alignSelf: "stretch",
    backgroundColor: theme.card,
    borderColor: theme.accent,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginBottom: 20,
  },
  drillLabel: {
    color: theme.accent,
    fontSize: 11,
    letterSpacing: 1.5,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  drillText: { color: theme.text, fontSize: 14, lineHeight: 20 },
  doneBtn: {
    backgroundColor: theme.accent,
    borderRadius: 999,
    paddingHorizontal: 26,
    paddingVertical: 12,
  },
  doneBtnPressed: { opacity: 0.8 },
  doneBtnText: { color: theme.bg, fontSize: 15, fontWeight: "700" },

  dots: {
    flexDirection: "row",
    justifyContent: "center",
    paddingVertical: 18,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: theme.border,
    marginHorizontal: 4,
  },
  dotActive: { backgroundColor: theme.accent },
});
