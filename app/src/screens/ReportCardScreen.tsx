import { LinearGradient } from "expo-linear-gradient";
import { useCallback, useState } from "react";
import {
  Dimensions,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { MoodCanvas } from "../components/MoodCanvas";
import { fonts, theme } from "../theme";
import { AxisScore, Report } from "../types";

interface Props {
  report: Report;
  onDone: () => void;
}

type Card =
  | { key: string; kind: "axis"; title: string; axis: AxisScore }
  | { key: string; kind: "coach" };

function scoreColor(score: number): string {
  if (score >= 70) return theme.accentBright;
  if (score < 40) return theme.danger;
  return theme.text;
}

/** Score bar fill (deep → bright candle gold; guttering red below 40). */
function scoreBarColors(score: number): readonly [string, string] {
  return score < 40 ? ["#7c2d1f", theme.danger] : [theme.accentDeep, theme.accentBright];
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
            <View style={styles.scoreTrack}>
              <LinearGradient
                colors={scoreBarColors(item.axis.score)}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={[
                  styles.scoreFill,
                  { width: `${Math.max(0, Math.min(100, item.axis.score))}%` },
                ]}
              />
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
      <MoodCanvas mood="night" />
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
  screen: { flex: 1, backgroundColor: theme.bg, paddingTop: 30 },
  pager: { flex: 1 },
  header: {
    color: theme.dim,
    fontSize: 13,
    fontFamily: fonts.displayLight,
    letterSpacing: 3,
    textTransform: "uppercase",
    textAlign: "center",
  },
  subHeader: {
    color: theme.text,
    fontSize: 19,
    fontFamily: fonts.display,
    letterSpacing: 0.5,
    textAlign: "center",
    marginTop: 6,
    marginBottom: 8,
  },

  card: { flex: 1, padding: 22, justifyContent: "center" },
  cardInner: {
    backgroundColor: theme.raised,
    borderColor: theme.hairline,
    borderWidth: 1,
    borderRadius: 20,
    padding: 24,
    alignItems: "center",
  },
  axisTitle: {
    color: theme.dim,
    fontSize: 12,
    fontFamily: fonts.display,
    letterSpacing: 2.5,
    textTransform: "uppercase",
    marginBottom: 8,
  },
  scoreRow: { flexDirection: "row", alignItems: "baseline" },
  score: { fontSize: 80, lineHeight: 92, fontFamily: fonts.display },
  scoreOutOf: { color: theme.faint, fontSize: 16, fontFamily: fonts.displayLight, marginLeft: 6 },
  scoreTrack: {
    alignSelf: "stretch",
    height: 6,
    borderRadius: 3,
    backgroundColor: theme.border,
    overflow: "hidden",
    marginTop: 12,
  },
  scoreFill: { height: "100%", borderRadius: 3 },
  detail: {
    color: theme.text,
    fontSize: 16,
    lineHeight: 23,
    fontFamily: fonts.speech,
    textAlign: "center",
    marginTop: 16,
  },
  swipeHint: {
    color: theme.faint,
    fontSize: 13,
    marginTop: 20,
    fontFamily: fonts.speechItalic,
  },

  notes: { alignSelf: "stretch", marginBottom: 16 },
  note: {
    color: theme.text,
    fontSize: 15,
    lineHeight: 22,
    fontFamily: fonts.speechItalic,
    marginBottom: 8,
    textAlign: "center",
  },
  drillBox: {
    alignSelf: "stretch",
    backgroundColor: theme.card,
    borderColor: theme.accentDeep,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    marginBottom: 20,
  },
  drillLabel: {
    color: theme.accent,
    fontSize: 11,
    fontFamily: fonts.display,
    letterSpacing: 2,
    textTransform: "uppercase",
    marginBottom: 5,
  },
  drillText: { color: theme.text, fontSize: 15, lineHeight: 21, fontFamily: fonts.speech },
  doneBtn: {
    backgroundColor: theme.accent,
    borderRadius: 999,
    paddingHorizontal: 26,
    paddingVertical: 12,
  },
  doneBtnPressed: {
    backgroundColor: theme.accentBright,
    shadowColor: theme.accent,
    shadowOpacity: 0.55,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 0 },
  },
  doneBtnText: { color: theme.bg, fontSize: 13, fontFamily: fonts.display, letterSpacing: 1 },

  dots: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 18,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: theme.hairline,
    marginHorizontal: 4,
  },
  dotActive: { width: 18, backgroundColor: theme.accent },
});
