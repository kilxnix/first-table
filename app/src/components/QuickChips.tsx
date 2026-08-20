import { Pressable, ScrollView, StyleSheet, Text } from "react-native";
import { fonts, theme } from "../theme";

interface Chip {
  label: string;
  text: string;
  /** Prefill the input bar instead of sending immediately. */
  prefill?: boolean;
}

const CHIPS: Chip[] = [
  { label: "Roll perception, everyone", text: "Roll perception, everyone" },
  { label: "What do you do?", text: "What do you do?" },
  { label: "Describe your surroundings", text: "Describe your surroundings" },
  { label: "Cut to…", text: "Cut to ", prefill: true },
];

interface Props {
  onSend: (text: string) => void;
  onPrefill: (text: string) => void;
}

export function QuickChips({ onSend, onPrefill }: Props) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.strip}
      contentContainerStyle={styles.content}
    >
      {CHIPS.map((chip) => (
        <Pressable
          key={chip.label}
          onPress={() => (chip.prefill ? onPrefill(chip.text) : onSend(chip.text))}
          style={({ pressed }) => [styles.chip, pressed && styles.chipPressed]}
        >
          <Text style={styles.chipText}>{chip.label}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  strip: { flexGrow: 0 },
  content: { paddingHorizontal: 12, paddingVertical: 8 },
  chip: {
    backgroundColor: "rgba(28, 21, 18, 0.72)",
    borderColor: "rgba(224, 168, 63, 0.32)",
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 7,
    marginRight: 8,
  },
  chipPressed: {
    backgroundColor: "rgba(224, 168, 63, 0.14)",
    borderColor: theme.accent,
    shadowColor: theme.accent,
    shadowOpacity: 0.4,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
    elevation: 3,
  },
  chipText: { color: theme.accent, fontFamily: fonts.speech, fontSize: 13.5 },
});
