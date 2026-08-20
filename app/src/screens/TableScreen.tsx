import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getCoachPref, nextCoachStep, setCoachPref } from "../coach";
import { ChatThread } from "../components/ChatThread";
import { CoachOverlay } from "../components/CoachOverlay";
import { DiceTray } from "../components/DiceTray";
import { DMDrawer } from "../components/DMDrawer";
import { InputBar, InputBarHandle } from "../components/InputBar";
import { MoodCanvas } from "../components/MoodCanvas";
import { QuickChips } from "../components/QuickChips";
import { useTableSocket } from "../hooks/useTableSocket";
import { fonts, Mood, theme } from "../theme";
import { Report } from "../types";

interface Props {
  campaignId: number;
  onOpenDrawer?: () => void;
  onShowReport: (report: Report) => void;
  onExit?: () => void;
}

export function TableScreen({ campaignId, onOpenDrawer, onShowReport, onExit }: Props) {
  const {
    state,
    thread,
    typing,
    dmScreen,
    report,
    sceneActive,
    connected,
    error,
    sendDmInput,
    sendRoll,
    startScene,
    endScene,
  } = useTableSocket(campaignId);
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  // Recomputed every render (and therefore on every rotation) — never sampled once.
  const compact = width < 400; // action pills drop their labels
  const narrow = width < 360; // the seat panel tightens its gutters
  const inputRef = useRef<InputBarHandle>(null);
  const [busy, setBusy] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [trayOpen, setTrayOpen] = useState(false);
  const [coachPref, setCoachPrefState] = useState(getCoachPref);
  const [coachDismissed, setCoachDismissed] = useState<ReadonlySet<string>>(new Set());

  const chooseCoach = useCallback((pref: "on" | "off") => {
    setCoachPref(pref);
    setCoachPrefState(pref);
  }, []);
  const dismissCoachStep = useCallback((id: string) => {
    setCoachDismissed((d) => new Set(d).add(id));
  }, []);
  const skipTour = useCallback(() => chooseCoach("off"), [chooseCoach]);

  const coachStep =
    coachPref === "on" ? nextCoachStep(thread, sceneActive, coachDismissed) : null;

  const lastRoll = useMemo(() => {
    for (let i = thread.length - 1; i >= 0; i--) {
      if (thread[i].kind === "roll") return thread[i];
    }
    return null;
  }, [thread]);

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
  const openDrawer = useCallback(() => {
    setDrawerOpen(true);
    onOpenDrawer?.();
  }, [onOpenDrawer]);

  const empty = !sceneActive && thread.length === 0;

  // Story temperature drives the backdrop: night before the scene, dusk while
  // the opening beat plays, embers once the story is properly burning.
  const activeBeatIndex = dmScreen ? dmScreen.beats.findIndex((b) => b.status === "active") : -1;
  const mood: Mood = !sceneActive ? "night" : activeBeatIndex > 0 ? "ember" : "dusk";

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <MoodCanvas mood={mood} />
      <View
        style={[
          styles.header,
          {
            paddingTop: 10 + insets.top,
            paddingLeft: 12 + insets.left,
            paddingRight: 12 + insets.right,
          },
        ]}
      >
        <View style={styles.headerLeft}>
          {onExit && (
            <Pressable onPress={onExit} hitSlop={8} style={styles.backBtn}>
              <Text style={styles.backText}>{"‹"}</Text>
            </Pressable>
          )}
          <Text style={[styles.candle, !connected && styles.candleOut]}>{"\u{1F56F}️"}</Text>
          {/* Last thing to lose space: flex + minWidth 0 so the pills shrink first. */}
          <Text style={[styles.title, compact && styles.titleCompact]} numberOfLines={1}>
            {state?.name ?? "…"}
          </Text>
        </View>
        <View style={styles.headerRight}>
          <Pressable
            onPress={() => setTrayOpen(true)}
            style={({ pressed }) => [
              styles.hBtn,
              compact && styles.hBtnCompact,
              pressed && styles.hBtnPressed,
            ]}
            accessibilityLabel="Open dice tray"
          >
            <Text style={styles.hBtnText} numberOfLines={1}>
              {"\u{1F3B2}"}
            </Text>
          </Pressable>
          <Pressable
            onPress={openDrawer}
            style={({ pressed }) => [
              styles.hBtn,
              compact && styles.hBtnCompact,
              pressed && styles.hBtnPressed,
            ]}
            accessibilityLabel="Open DM screen"
          >
            <Text style={styles.hBtnText} numberOfLines={1}>
              {compact ? "\u{1F6E1}️" : "\u{1F6E1}️ DM Screen"}
            </Text>
          </Pressable>
          <Pressable
            onPress={toggleScene}
            style={({ pressed }) => [
              styles.hBtn,
              compact && styles.hBtnCompact,
              sceneActive ? styles.endBtn : styles.startBtn,
              pressed && styles.hBtnPressed,
            ]}
          >
            <Text
              style={[styles.hBtnText, !sceneActive && styles.startBtnText]}
              numberOfLines={1}
            >
              {sceneActive
                ? compact
                  ? "End"
                  : "Scene ▸ End"
                : compact
                  ? "Start"
                  : "Start scene"}
            </Text>
          </Pressable>
        </View>
      </View>

      {error ? (
        <View
          style={[
            styles.errorRow,
            { paddingLeft: 12 + insets.left, paddingRight: 12 + insets.right },
          ]}
        >
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      {empty ? (
        <View
          style={[
            styles.seatWrap,
            {
              paddingLeft: (narrow ? 20 : 32) + insets.left,
              paddingRight: (narrow ? 20 : 32) + insets.right,
            },
          ]}
        >
          <View style={styles.seatGlowWrap}>
            <View style={[styles.glowCircle, styles.glowOuter]} />
            <View style={[styles.glowCircle, styles.glowInner]} />
            <Text style={styles.seatEmoji}>{"\u{1F56F}"}️</Text>
          </View>
          <Text style={styles.seatTitle}>Take your seat</Text>
          <Text style={styles.seatSub}>
            The party is already at the table. Start the scene and they speak first — your job is
            to react.
          </Text>
          {coachPref === null ? (
            <>
              <Pressable
                onPress={() => {
                  chooseCoach("on");
                  toggleScene();
                }}
                style={({ pressed }) => [
                  styles.seatBtn,
                  narrow && styles.seatBtnNarrow,
                  pressed && styles.seatBtnPressed,
                ]}
              >
                <Text style={styles.seatBtnText}>{"\u{1F393}"} Coach me through my first scene</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  chooseCoach("off");
                  toggleScene();
                }}
                hitSlop={8}
                style={styles.seatAltBtn}
              >
                <Text style={styles.seatAltText}>I've got this — just start</Text>
              </Pressable>
            </>
          ) : (
            <Pressable
              onPress={toggleScene}
              style={({ pressed }) => [
                styles.seatBtn,
                narrow && styles.seatBtnNarrow,
                pressed && styles.seatBtnPressed,
              ]}
            >
              <Text style={styles.seatBtnText}>Start the scene</Text>
            </Pressable>
          )}
        </View>
      ) : (
        <ChatThread thread={thread} typing={typing} party={state?.party ?? []} />
      )}

      {coachStep && (
        <CoachOverlay
          key={coachStep.id}
          step={coachStep}
          onDismiss={dismissCoachStep}
          onSkipTour={skipTour}
        />
      )}
      {sceneActive && connected && <QuickChips onSend={sendChip} onPrefill={prefillChip} />}
      <InputBar ref={inputRef} onSend={sendDmInput} disabled={!sceneActive || !connected} />

      <DiceTray
        visible={trayOpen}
        onClose={() => setTrayOpen(false)}
        onRoll={sendRoll}
        lastRoll={lastRoll}
        disabled={!connected}
      />
      <DMDrawer
        visible={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        dmScreen={dmScreen}
        party={state?.party}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  // Transparent: the MoodCanvas underneath is the true ground of the screen.
  screen: { flex: 1, backgroundColor: "transparent" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    // Horizontal + top padding are applied inline so safe-area insets fold in.
    paddingBottom: 10,
    backgroundColor: "rgba(15, 11, 8, 0.72)",
    borderBottomColor: "rgba(224, 168, 63, 0.3)",
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    minWidth: 0,
    marginRight: 8,
  },
  backBtn: { marginRight: 8, paddingHorizontal: 2, flexShrink: 0 },
  backText: { color: theme.dim, fontSize: 24, lineHeight: 26 },
  candle: { fontSize: 13, marginRight: 8, flexShrink: 0 },
  candleOut: { opacity: 0.35 },
  title: {
    color: theme.text,
    fontFamily: fonts.display,
    fontSize: 15,
    letterSpacing: 1,
    flex: 1,
    minWidth: 0,
  },
  titleCompact: { fontSize: 14, letterSpacing: 0.5 },
  headerRight: { flexDirection: "row", alignItems: "center", flexShrink: 0 },
  hBtn: {
    backgroundColor: "rgba(38, 29, 23, 0.78)",
    borderColor: theme.hairline,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 6,
    marginLeft: 8,
  },
  hBtnCompact: { paddingHorizontal: 8, marginLeft: 5 },
  hBtnPressed: { opacity: 0.7 },
  hBtnText: { color: theme.text, fontSize: 12, fontWeight: "600" },
  startBtn: { backgroundColor: theme.accent, borderColor: theme.accent },
  startBtnText: { color: theme.bg },
  endBtn: { borderColor: theme.danger },

  errorRow: {
    backgroundColor: "rgba(192, 80, 63, 0.12)",
    borderBottomColor: "rgba(192, 80, 63, 0.4)",
    borderBottomWidth: 1,
    paddingVertical: 6,
  },
  errorText: { color: theme.danger, fontFamily: fonts.speechItalic, fontSize: 12.5 },

  seatWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 32,
  },
  seatGlowWrap: {
    width: 150,
    height: 150,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  glowCircle: { position: "absolute", borderRadius: 999, backgroundColor: theme.accent },
  glowOuter: { width: 150, height: 150, opacity: 0.05 },
  glowInner: { width: 92, height: 92, opacity: 0.09 },
  seatEmoji: { fontSize: 44 },
  seatTitle: {
    color: theme.text,
    fontFamily: fonts.display,
    fontSize: 24,
    letterSpacing: 2,
    marginBottom: 10,
    textAlign: "center",
    maxWidth: "100%",
  },
  seatSub: {
    color: theme.dim,
    fontFamily: fonts.speech,
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
    maxWidth: 320,
    width: "100%",
    marginBottom: 24,
  },
  seatBtn: {
    backgroundColor: theme.accent,
    borderRadius: 999,
    paddingHorizontal: 26,
    paddingVertical: 12,
    // The coach label is long: let the pill use the full gutter and wrap inside.
    maxWidth: "100%",
    shadowColor: theme.accent,
    shadowOpacity: 0.35,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 2 },
    elevation: 6,
  },
  seatBtnNarrow: { paddingHorizontal: 16, paddingVertical: 11 },
  seatBtnPressed: { opacity: 0.8 },
  seatBtnText: {
    color: theme.bg,
    fontFamily: fonts.speechBold,
    fontSize: 16,
    textAlign: "center",
  },
  seatAltBtn: { marginTop: 14, maxWidth: "100%" },
  seatAltText: {
    color: theme.dim,
    fontFamily: fonts.speechItalic,
    fontSize: 13.5,
    textAlign: "center",
    textDecorationLine: "underline",
  },
});
