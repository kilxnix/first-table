import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useRef } from "react";
import { Animated, StyleSheet, View } from "react-native";
import { Mood, moods, theme } from "../theme";

interface Props {
  mood?: Mood;
}

/**
 * The abstract backdrop (spec §9.5 "visuals stay abstract"): a vertical dusk
 * gradient tuned to the story's temperature, plus a slow-breathing candle glow.
 * Purely decorative — pointerEvents none, sits behind everything.
 */
export function MoodCanvas({ mood = "dusk" }: Props) {
  const breath = useRef(new Animated.Value(0)).current;

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

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <LinearGradient colors={[...moods[mood]]} style={StyleSheet.absoluteFill} />
      <Animated.View style={[styles.glow, { opacity: glowOpacity }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  glow: {
    position: "absolute",
    bottom: -160,
    alignSelf: "center",
    width: 520,
    height: 380,
    borderRadius: 260,
    backgroundColor: theme.accent,
    transform: [{ scaleX: 1.4 }],
  },
});
