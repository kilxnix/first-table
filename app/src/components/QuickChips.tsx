import { Pressable, ScrollView, StyleSheet, Text } from "react-native";
import { theme } from "../theme";

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
    backgroundColor: theme.panel,
    borderColor: theme.border,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 13,
    paddingVertical: 7,
    marginRight: 8,
  },
  chipPressed: { backgroundColor: theme.card, borderColor: theme.accent },
  chipText: { color: theme.accent, fontSize: 13 },
});
