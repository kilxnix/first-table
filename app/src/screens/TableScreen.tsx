import { useCallback, useEffect, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { ChatThread } from "../components/ChatThread";
import { InputBar, InputBarHandle } from "../components/InputBar";
import { QuickChips } from "../components/QuickChips";
import { useTableSocket } from "../hooks/useTableSocket";
import { theme } from "../theme";
import { Report } from "../types";

const serif = Platform.select({ ios: "Georgia", android: "serif", default: "Georgia, 'Times New Roman', serif" });

interface Props {
  campaignId: number;
  onOpenDrawer?: () => void;
  onShowReport: (report: Report) => void;
}

export function TableScreen({ campaignId, onOpenDrawer, onShowReport }: Props) {
  const {
    state,
    thread,
    typing,
    report,
    sceneActive,
    connected,
    error,
    sendDmInput,
    sendRoll,
    startScene,
    endScene,
  } = useTableSocket(campaignId);
  const inputRef = useRef<InputBarHandle>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (report) onShowReport(report);
  }, [report, onShowReport]);

  const toggleScene = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (sceneActive) {
        const res = await endScene();
        if (res?.report) onShowReport(res.report);
      } else {
        await startScene();
      }
    } catch {
      // Server unreachable or scene already toggled; WS frames stay authoritative.
    } finally {
      setBusy(false);
    }
  }, [busy, sceneActive, startScene, endScene, onShowReport]);

  const sendChip = useCallback((text: string) => sendDmInput(text, "text"), [sendDmInput]);
  const prefillChip = useCallback((text: string) => inputRef.current?.prefill(text), []);

  const empty = !sceneActive && thread.length === 0;
  void sendRoll; // dice tray lands in the next task

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View
            style={[styles.dot, { backgroundColor: connected ? theme.accent : theme.danger }]}
          />
          <Text style={styles.title} numberOfLines={1}>
            {state?.name ?? "…"}
          </Text>
        </View>
        <View style={styles.headerRight}>
          <Pressable
            onPress={onOpenDrawer}
            style={({ pressed }) => [styles.hBtn, pressed && styles.hBtnPressed]}
          >
            <Text style={styles.hBtnText}>{"\u{1F6E1}"}️ DM Screen</Text>
          </Pressable>
          <Pressable
            onPress={toggleScene}
            style={({ pressed }) => [
              styles.hBtn,
              sceneActive ? styles.endBtn : styles.startBtn,
              pressed && styles.hBtnPressed,
            ]}
          >
            <Text style={[styles.hBtnText, !sceneActive && styles.startBtnText]}>
              {sceneActive ? "Scene ▸ End" : "Start scene"}
            </Text>
          </Pressable>
        </View>
      </View>

      {error ? (
        <View style={styles.errorRow}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      {empty ? (
        <View style={styles.seatWrap}>
          <Text style={styles.seatEmoji}>{"\u{1F56F}"}️</Text>
          <Text style={styles.seatTitle}>Take your seat</Text>
          <Text style={styles.seatSub}>
            The party is already at the table. Start the scene and they speak first — your job is
            to react.
          </Text>
          <Pressable
            onPress={toggleScene}
            style={({ pressed }) => [styles.seatBtn, pressed && styles.seatBtnPressed]}
          >
            <Text style={styles.seatBtnText}>Start the scene</Text>
          </Pressable>
        </View>
      ) : (
        <ChatThread thread={thread} typing={typing} party={state?.party ?? []} />
      )}

      {sceneActive && <QuickChips onSend={sendChip} onPrefill={prefillChip} />}
      <InputBar ref={inputRef} onSend={sendDmInput} disabled={!sceneActive || !connected} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: theme.panel,
    borderBottomColor: theme.border,
    borderBottomWidth: 1,
  },
  headerLeft: { flexDirection: "row", alignItems: "center", flexShrink: 1, marginRight: 8 },
  dot: { width: 8, height: 8, borderRadius: 4, marginRight: 8 },
  title: { color: theme.text, fontSize: 16, fontWeight: "700", fontFamily: serif, flexShrink: 1 },
  headerRight: { flexDirection: "row", alignItems: "center" },
  hBtn: {
    backgroundColor: theme.card,
    borderColor: theme.border,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 6,
    marginLeft: 8,
  },
  hBtnPressed: { opacity: 0.7 },
  hBtnText: { color: theme.text, fontSize: 12, fontWeight: "600" },
  startBtn: { backgroundColor: theme.accent, borderColor: theme.accent },
  startBtnText: { color: theme.bg },
  endBtn: { borderColor: theme.danger },

  errorRow: {
    backgroundColor: theme.card,
    borderBottomColor: theme.border,
    borderBottomWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  errorText: { color: theme.danger, fontSize: 12 },

  seatWrap: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32 },
  seatEmoji: { fontSize: 44, marginBottom: 12 },
  seatTitle: {
    color: theme.text,
    fontSize: 26,
    fontWeight: "700",
    fontFamily: serif,
    marginBottom: 10,
  },
  seatSub: {
    color: theme.dim,
    fontSize: 14,
    lineHeight: 21,
    textAlign: "center",
    maxWidth: 320,
    marginBottom: 22,
  },
  seatBtn: {
    backgroundColor: theme.accent,
    borderRadius: 999,
    paddingHorizontal: 26,
    paddingVertical: 12,
  },
  seatBtnPressed: { opacity: 0.8 },
  seatBtnText: { color: theme.bg, fontSize: 16, fontWeight: "700" },
});
