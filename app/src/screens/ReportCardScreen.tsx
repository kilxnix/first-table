import { LinearGradient } from "expo-linear-gradient";
import { useCallback, useState } from "react";
import {
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
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

/** On web the app is a centered column (App.tsx); on a device it IS the screen. */
const WEB_COLUMN_WIDTH = 520;

export function ReportCardScreen({ report, onDone }: Props) {
  const [measured, setMeasured] = useState(0);
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  // Fallback for environments where onLayout is delayed or never fires (e.g.
  // hidden tabs). Derived from the LIVE window, never a module-scope snapshot:
  // a stale width would page the cards at the wrong offset after a rotation.
  const fallbackWidth =
    Platform.OS === "web" ? Math.min(windowWidth, WEB_COLUMN_WIDTH) : windowWidth;
  // A measurement left over from a wider orientation is clamped, so a card can
  // never be wider than the pager it lives in.
  const width = measured > 0 ? Math.min(measured, fallbackWidth) : fallbackWidth;
  const narrow = width < 340;
  /** Centred chrome keeps clear of a notch on whichever edge it lands. */
  const sideInset = Math.max(insets.left, insets.right);
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
      <View
        style={[
          styles.card,
          { width, paddingLeft: 22 + insets.left, paddingRight: 22 + insets.right },
        ]}
      >
        {item.kind === "axis" ? (
          <View style={[styles.cardInner, narrow && styles.cardInnerNarrow]}>
            <Text style={styles.axisTitle} numberOfLines={1}>
              {item.title}
            </Text>
            <View style={styles.scoreRow}>
              <Text
                style={[
                  styles.score,
                  narrow && styles.scoreNarrow,
                  { color: scoreColor(item.axis.score) },
                ]}
                numberOfLines={1}
              >
                {item.axis.score}
              </Text>
              <Text style={styles.scoreOutOf} numberOfLines={1}>
                /100
              </Text>
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
          <View style={[styles.cardInner, narrow && styles.cardInnerNarrow]}>
            <Text style={styles.axisTitle} numberOfLines={1}>
              Coach{"'"}s corner
            </Text>
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
              <Text style={styles.doneBtnText} numberOfLines={1}>
                Back to the table
              </Text>
            </Pressable>
          </View>
        )}
      </View>
    ),
    [width, narrow, insets, report, onDone]
  );

  return (
    <View
      style={[styles.screen, { paddingTop: 30 + insets.top }]}
      onLayout={(e) => setMeasured(e.nativeEvent.layout.width)}
    >
      <MoodCanvas mood="night" />
      <Text style={[styles.header, { paddingHorizontal: 16 + sideInset }]} numberOfLines={1}>
        Scene report
      </Text>
      <Text style={[styles.subHeader, { paddingHorizontal: 16 + sideInset }]} numberOfLines={1}>
        Scene {report.scene_id}
      </Text>
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
      <View style={[styles.dots, { paddingBottom: 18 + insets.bottom }]}>
        {cards.map((c, i) => (
          <View key={c.key} style={[styles.dot, i === page && styles.dotActive]} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // paddingTop is supplied per-render (safe-area top inset).
  screen: { flex: 1, backgroundColor: theme.bg },
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

  // Horizontal padding is supplied per-render (side insets).
  card: { flex: 1, paddingVertical: 22, justifyContent: "center" },
  cardInner: {
    backgroundColor: theme.raised,
    borderColor: theme.hairline,
    borderWidth: 1,
    borderRadius: 20,
    padding: 24,
    alignItems: "center",
    alignSelf: "stretch",
  },
  cardInnerNarrow: { padding: 16, borderRadius: 16 },
  axisTitle: {
    color: theme.dim,
    fontSize: 12,
    fontFamily: fonts.display,
    letterSpacing: 2.5,
    textTransform: "uppercase",
    marginBottom: 8,
  },
  scoreRow: {
    flexDirection: "row",
    alignItems: "baseline",
    maxWidth: "100%",
    flexShrink: 1,
    minWidth: 0,
  },
  score: { fontSize: 80, lineHeight: 92, fontFamily: fonts.display, flexShrink: 1, minWidth: 0 },
  /** Same Cinzel numeral, one step down so 100/100 clears a 320pt card. */
  scoreNarrow: { fontSize: 60, lineHeight: 70 },
  scoreOutOf: {
    color: theme.faint,
    fontSize: 16,
    fontFamily: fonts.displayLight,
    marginLeft: 6,
    flexShrink: 0,
  },
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
    maxWidth: "100%",
    flexShrink: 1,
  },
  doneBtnPressed: {
    backgroundColor: theme.accentBright,
    shadowColor: theme.accent,
    shadowOpacity: 0.55,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 0 },
  },
  doneBtnText: { color: theme.bg, fontSize: 13, fontFamily: fonts.display, letterSpacing: 1 },

  // paddingBottom is supplied per-render (gesture-bar inset).
  dots: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    paddingTop: 18,
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
