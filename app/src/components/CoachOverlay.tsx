import { Pressable, StyleSheet, Text, View } from "react-native";
import { CoachStep } from "../coach";
import { theme } from "../theme";

interface Props {
  step: CoachStep;
  onDismiss: (stepId: string) => void;
  onSkipTour: () => void;
}

/** One corner-coach tip card, anchored above the input bar. Never blocks play. */
export function CoachOverlay({ step, onDismiss, onSkipTour }: Props) {
  return (
    <View style={styles.card} pointerEvents="box-none">
      <View style={styles.inner}>
        <Text style={styles.label}>{"\u{1F393}"} COACH</Text>
        <Text style={styles.text}>{step.text}</Text>
        <View style={styles.row}>
          <Pressable onPress={onSkipTour} hitSlop={8}>
            <Text style={styles.skip}>skip the tour</Text>
          </Pressable>
          <Pressable
            onPress={() => onDismiss(step.id)}
            style={({ pressed }) => [styles.gotIt, pressed && styles.gotItPressed]}
          >
            <Text style={styles.gotItText}>Got it</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { paddingHorizontal: 12, paddingBottom: 6 },
  inner: {
    backgroundColor: theme.card,
    borderColor: theme.accent,
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
  },
  label: {
    color: theme.accent,
    fontSize: 10,
    letterSpacing: 1.5,
    fontWeight: "700",
    marginBottom: 5,
  },
  text: { color: theme.text, fontSize: 13, lineHeight: 19 },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 10,
  },
  skip: { color: theme.dim, fontSize: 12, textDecorationLine: "underline" },
  gotIt: {
    backgroundColor: theme.accent,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  gotItPressed: { opacity: 0.8 },
  gotItText: { color: theme.bg, fontSize: 12, fontWeight: "700" },
});
