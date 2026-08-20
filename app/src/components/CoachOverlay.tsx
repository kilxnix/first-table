import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useRef } from "react";
import { Animated, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { CoachStep } from "../coach";
import { fonts, theme } from "../theme";

const NATIVE = Platform.OS !== "web";

interface Props {
  step: CoachStep;
  onDismiss: (stepId: string) => void;
  onSkipTour: () => void;
}

/** One corner-coach tip card, anchored above the input bar. Never blocks play. */
export function CoachOverlay({ step, onDismiss, onSkipTour }: Props) {
  const rise = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(rise, {
      toValue: 1,
      friction: 8,
      tension: 80,
      useNativeDriver: NATIVE,
    }).start();
  }, [rise]);

  return (
    <View style={styles.card} pointerEvents="box-none">
      <Animated.View
        style={[
          styles.inner,
          {
            opacity: rise.interpolate({ inputRange: [0, 1], outputRange: [0, 1], extrapolate: "clamp" }),
            transform: [{ translateY: rise.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }],
          },
        ]}
      >
        <LinearGradient
          colors={["rgba(242, 193, 100, 0.1)", "rgba(242, 193, 100, 0.0)"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0.75, y: 1 }}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        <View style={styles.plaque}>
          <Text style={styles.plaqueText}>{"\u{1F393}"} COACH</Text>
        </View>
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
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { paddingHorizontal: 12, paddingBottom: 6 },
  inner: {
    backgroundColor: theme.card,
    borderColor: "rgba(224, 168, 63, 0.55)",
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 7,
  },
  plaque: {
    alignSelf: "flex-start",
    backgroundColor: theme.accent,
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginBottom: 8,
  },
  plaqueText: {
    color: theme.bg,
    fontFamily: fonts.display,
    fontSize: 10,
    letterSpacing: 2,
  },
  text: { color: theme.text, fontFamily: fonts.speech, fontSize: 14, lineHeight: 20 },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 10,
  },
  skip: {
    color: theme.dim,
    fontFamily: fonts.speechItalic,
    fontSize: 12.5,
    textDecorationLine: "underline",
  },
  gotIt: {
    backgroundColor: theme.accent,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  gotItPressed: { opacity: 0.8 },
  gotItText: { color: theme.bg, fontFamily: fonts.speechBold, fontSize: 12.5 },
});
