import { useEffect, useRef } from "react";
import { Animated, Easing, Platform, StyleSheet, Text, View } from "react-native";
import { theme } from "../theme";

const NATIVE = Platform.OS !== "web";

/**
 * "{name} is typing" with three animated dots (400 ms stagger), popping in
 * like a real group-chat typing indicator (spec §9).
 */
export function TypingRow({ name }: { name: string }) {
  const pop = useRef(new Animated.Value(0)).current;
  const dots = [
    useRef(new Animated.Value(0.25)).current,
    useRef(new Animated.Value(0.25)).current,
    useRef(new Animated.Value(0.25)).current,
  ];

  useEffect(() => {
    const entrance = Animated.spring(pop, {
      toValue: 1,
      friction: 6,
      tension: 120,
      useNativeDriver: NATIVE,
    });
    const waves = dots.map((v, i) =>
      Animated.sequence([
        Animated.delay(i * 400),
        Animated.loop(
          Animated.sequence([
            Animated.timing(v, {
              toValue: 1,
              duration: 300,
              easing: Easing.out(Easing.quad),
              useNativeDriver: NATIVE,
            }),
            Animated.timing(v, {
              toValue: 0.25,
              duration: 300,
              easing: Easing.in(Easing.quad),
              useNativeDriver: NATIVE,
            }),
            Animated.delay(600),
          ])
        ),
      ])
    );
    entrance.start();
    waves.forEach((w) => w.start());
    return () => {
      entrance.stop();
      waves.forEach((w) => w.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Animated.View
      style={[
        styles.row,
        {
          opacity: pop,
          transform: [
            { scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }) },
            { translateY: pop.interpolate({ inputRange: [0, 1], outputRange: [6, 0] }) },
          ],
        },
      ]}
    >
      <View style={styles.pill}>
        <Text style={styles.label}>{name} is typing</Text>
        <View style={styles.dots}>
          {dots.map((v, i) => (
            <Animated.View key={i} style={[styles.dot, { opacity: v }]} />
          ))}
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", marginTop: 8, marginLeft: 40 },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: theme.panel,
    borderColor: theme.border,
    borderWidth: 1,
    borderRadius: 14,
    borderBottomLeftRadius: 4,
    paddingHorizontal: 11,
    paddingVertical: 6,
  },
  label: { color: theme.dim, fontSize: 12, fontStyle: "italic" },
  dots: { flexDirection: "row", marginLeft: 6, alignItems: "center" },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: theme.dim,
    marginHorizontal: 1.5,
  },
});
