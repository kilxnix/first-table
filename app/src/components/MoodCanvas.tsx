import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useRef } from "react";
import { Animated, StyleSheet, useWindowDimensions, View } from "react-native";
import { Mood, moods, theme } from "../theme";

interface Props {
  mood?: Mood;
}

/**
 * The abstract backdrop (spec §9.5 "visuals stay abstract"): a vertical dusk
 * gradient tuned to the story's temperature, plus a slow-breathing candle glow.
 * Purely decorative — pointerEvents none, clipped to its own bounds, and sized
 * from the live window so it can never widen the page on a narrow screen.
 */
export function MoodCanvas({ mood = "dusk" }: Props) {
  const breath = useRef(new Animated.Value(0)).current;
  const { width } = useWindowDimensions();

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(breath, { toValue: 1, duration: 3600, useNativeDriver: false }),
        Animated.timing(breath, { toValue: 0, duration: 3600, useNativeDriver: false }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [breath]);

  const glowOpacity = breath.interpolate({ inputRange: [0, 1], outputRange: [0.05, 0.11] });
  const glowWidth = Math.min(width, 520);

  return (
    <View style={styles.canvas} pointerEvents="none">
      <LinearGradient colors={[...moods[mood]]} style={StyleSheet.absoluteFill} />
      <Animated.View
        style={[
          styles.glow,
          {
            width: glowWidth,
            height: glowWidth * 0.73,
            borderRadius: glowWidth / 2,
            bottom: -glowWidth * 0.31,
            opacity: glowOpacity,
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  // absoluteFill + clipping: the glow is intentionally larger than its slot.
  canvas: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, overflow: "hidden" },
  glow: {
    position: "absolute",
    alignSelf: "center",
    backgroundColor: theme.accent,
  },
});
