import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { createRecognizer, speechAvailable } from "../speech";
import { theme } from "../theme";

export interface InputBarHandle {
  /** Put text into the input (used by the "Cut to…" quick chip) and focus it. */
  prefill(text: string): void;
}

interface Props {
  onSend: (text: string, mode: "voice" | "text") => void;
  disabled: boolean;
}

const webNoOutline = Platform.OS === "web" ? ({ outlineStyle: "none" } as any) : null;

export const InputBar = forwardRef<InputBarHandle, Props>(function InputBar({ onSend, disabled }, ref) {
  const [text, setText] = useState("");
  const [listening, setListening] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const inputRef = useRef<TextInput>(null);
  const recRef = useRef<ReturnType<typeof createRecognizer>>(null);
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
          placeholderTextColor={listening ? theme.accent : theme.dim}
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
          <Text style={[styles.sendIcon, !canSend && styles.sendIconDisabled]}>{"➤"}</Text>
        </Pressable>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  bar: {
    backgroundColor: theme.panel,
    borderTopColor: theme.border,
    borderTopWidth: 1,
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom: 10,
  },
  hint: { color: theme.dim, fontSize: 12, marginBottom: 6, marginLeft: 4 },
  listeningHint: { color: theme.accent },
  row: { flexDirection: "row", alignItems: "flex-end" },
  micBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.card,
    borderColor: theme.border,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
  },
  micActive: { backgroundColor: theme.accent, borderColor: theme.accent },
  micIcon: { fontSize: 18 },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 110,
    backgroundColor: theme.card,
    borderColor: theme.border,
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 10,
    color: theme.text,
    fontSize: 15,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.accent,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 8,
  },
  sendDisabled: { backgroundColor: theme.card, borderColor: theme.border, borderWidth: 1 },
  sendIcon: { color: theme.bg, fontSize: 16, fontWeight: "700" },
  sendIconDisabled: { color: theme.dim },
  dimmed: { opacity: 0.55 },
});
