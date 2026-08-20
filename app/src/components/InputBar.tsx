import { LinearGradient } from "expo-linear-gradient";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { createRecognizer, speechAvailable } from "../speech";
import { fonts, theme } from "../theme";

export interface InputBarHandle {
  /** Put text into the input (used by the "Cut to…" quick chip) and focus it. */
  prefill(text: string): void;
}

interface Props {
  onSend: (text: string, mode: "voice" | "text") => void;
  disabled: boolean;
}

const NATIVE = Platform.OS !== "web";
const webNoOutline = Platform.OS === "web" ? ({ outlineStyle: "none" } as any) : null;

export const InputBar = forwardRef<InputBarHandle, Props>(function InputBar({ onSend, disabled }, ref) {
  const [text, setText] = useState("");
  const [listening, setListening] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const inputRef = useRef<TextInput>(null);
  const recRef = useRef<ReturnType<typeof createRecognizer>>(null);
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Decorative only: an ember ring breathes out of the mic while dictating.
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!listening) {
      pulse.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.timing(pulse, {
        toValue: 1,
        duration: 1200,
        easing: Easing.out(Easing.quad),
        useNativeDriver: NATIVE,
      })
    );
    loop.start();
    return () => loop.stop();
  }, [listening, pulse]);

  useImperativeHandle(ref, () => ({
    prefill(t: string) {
      setText(t);
      inputRef.current?.focus();
    },
  }));

  useEffect(() => () => {
    if (hintTimer.current) clearTimeout(hintTimer.current);
    recRef.current?.stop();
  }, []);

  // If the bar becomes disabled mid-dictation (socket drop), stop the
  // recognizer so the transcript isn't silently discarded on release.
  useEffect(() => {
    if (disabled && listening) {
      try {
        recRef.current?.stop();
      } catch {
        setListening(false);
      }
    }
  }, [disabled, listening]);

  const showHint = useCallback((msg: string) => {
    setHint(msg);
    if (hintTimer.current) clearTimeout(hintTimer.current);
    hintTimer.current = setTimeout(() => setHint(null), 3500);
  }, []);

  const submit = useCallback(() => {
    const t = text.trim();
    if (!t || disabled) return;
    onSend(t, "text");
    setText("");
  }, [text, disabled, onSend]);

  const onKeyPress = useCallback(
    (e: any) => {
      if (Platform.OS === "web" && e.nativeEvent?.key === "Enter" && !e.nativeEvent?.shiftKey) {
        e.preventDefault?.();
        submit();
      }
    },
    [submit]
  );

  const startListening = useCallback(() => {
    if (disabled || listening) return;
    if (!speechAvailable()) {
      showHint("Voice input runs in the web build for now — type away.");
      return;
    }
    const rec = createRecognizer(
      (t) => onSend(t, "voice"),
      () => setListening(false)
    );
    if (!rec) return;
    recRef.current = rec;
    setListening(true);
    try {
      rec.start();
    } catch {
      setListening(false);
    }
  }, [disabled, listening, onSend, showHint]);

  const stopListening = useCallback(() => {
    try {
      recRef.current?.stop();
    } catch {
      setListening(false);
    }
  }, []);

  const canSend = !!text.trim() && !disabled;

  return (
    <View style={styles.bar}>
      {(hint || listening) && (
        <Text style={[styles.hint, listening && styles.listeningHint]}>
          {listening ? "\u{1F399}️ listening… release to send" : hint}
        </Text>
      )}
      <View style={styles.row}>
        <View style={styles.micWrap}>
          {listening && (
            <Animated.View
              pointerEvents="none"
              style={[
                styles.micRing,
                {
                  opacity: pulse.interpolate({
                    inputRange: [0, 0.15, 1],
                    outputRange: [0, 0.7, 0],
                  }),
                  transform: [
                    {
                      scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1.5] }),
                    },
                  ],
                },
              ]}
            />
          )}
          <Pressable
            onPressIn={startListening}
            onPressOut={stopListening}
            style={({ pressed }) => [
              styles.micBtn,
              (listening || pressed) && speechAvailable() && styles.micActive,
              disabled && styles.dimmed,
            ]}
            accessibilityLabel="Hold to talk"
          >
            <Text style={styles.micIcon}>{"\u{1F3A4}"}</Text>
          </Pressable>
        </View>
        <TextInput
          ref={inputRef}
          style={[styles.input, webNoOutline, disabled && styles.dimmed]}
          value={text}
          onChangeText={setText}
          onKeyPress={onKeyPress}
          onSubmitEditing={submit}
          placeholder={
            disabled ? "Start a scene to address the table" : listening ? "listening…" : "Narrate the world…"
          }
          placeholderTextColor={listening ? theme.ember : theme.dim}
          multiline
          editable={!disabled}
          returnKeyType="send"
        />
        <Pressable
          onPress={submit}
          disabled={!canSend}
          style={[styles.sendBtn, !canSend && styles.sendDisabled]}
          accessibilityLabel="Send"
        >
          {canSend && (
            <LinearGradient
              colors={[theme.accentBright, theme.accent, theme.accentDeep]}
              start={{ x: 0.1, y: 0 }}
              end={{ x: 0.9, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
          )}
          <Text style={[styles.sendIcon, !canSend && styles.sendIconDisabled]}>{"➤"}</Text>
        </Pressable>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  // Transparent shell: the row below is the floating bar itself.
  bar: {
    backgroundColor: "transparent",
    paddingHorizontal: 10,
    paddingTop: 6,
    paddingBottom: 12,
  },
  hint: {
    color: theme.dim,
    fontFamily: fonts.speechItalic,
    fontSize: 12.5,
    marginBottom: 6,
    marginLeft: 10,
  },
  listeningHint: { color: theme.ember },
  row: {
    flexDirection: "row",
    alignItems: "flex-end",
    backgroundColor: theme.raised,
    borderColor: theme.hairline,
    borderWidth: 1,
    borderRadius: 25,
    padding: 5,
    shadowColor: "#000",
    shadowOpacity: 0.45,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 5 },
    elevation: 9,
  },
  micWrap: { width: 38, height: 38, marginRight: 4 },
  micRing: {
    position: "absolute",
    top: -4,
    left: -4,
    right: -4,
    bottom: -4,
    borderRadius: 23,
    borderColor: theme.ember,
    borderWidth: 2,
  },
  micBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: theme.card,
    borderColor: theme.hairline,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  micActive: { backgroundColor: theme.ember, borderColor: theme.ember },
  micIcon: { fontSize: 17 },
  input: {
    flex: 1,
    minHeight: 38,
    maxHeight: 110,
    backgroundColor: "transparent",
    borderWidth: 0,
    paddingHorizontal: 12,
    paddingTop: 9,
    paddingBottom: 9,
    color: theme.text,
    fontFamily: fonts.speech,
    fontSize: 15.5,
  },
  sendBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: theme.accent,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 4,
    overflow: "hidden",
  },
  sendDisabled: {
    backgroundColor: "transparent",
    borderColor: theme.hairline,
    borderWidth: 1,
  },
  sendIcon: { color: theme.bg, fontSize: 16, fontWeight: "700" },
  sendIconDisabled: { color: theme.faint },
  dimmed: { opacity: 0.55 },
});
