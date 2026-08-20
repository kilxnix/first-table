import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useState } from "react";
import { Platform, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { loadServerHost } from "./src/config";
import { useAppFonts } from "./src/fonts";
import { HomeScreen } from "./src/screens/HomeScreen";
import { ReportCardScreen } from "./src/screens/ReportCardScreen";
import { TableScreen } from "./src/screens/TableScreen";
import { theme } from "./src/theme";
import { Report } from "./src/types";

const WEB = Platform.OS === "web";
/** On web we fake a phone: a centered column. On a real device the app IS the
 * screen — never cap the width, never draw side borders. */
const WEB_COLUMN_WIDTH = 520;

type Screen =
  | { screen: "home" }
  | { screen: "table"; campaignId: number }
  | { screen: "report"; campaignId: number; report: Report };

export default function App() {
  const fontsReady = useAppFonts();
  const [hostReady, setHostReady] = useState(false);
  const [screen, setScreen] = useState<Screen>({ screen: "home" });
  const { width } = useWindowDimensions();

  useEffect(() => {
    loadServerHost().finally(() => setHostReady(true));
  }, []);

  const enterTable = useCallback(
    (campaignId: number) => setScreen({ screen: "table", campaignId }),
    []
  );
  const goHome = useCallback(() => setScreen({ screen: "home" }), []);
  const showReport = useCallback(
    (report: Report) =>
      setScreen((s) =>
        s.screen === "table" ? { screen: "report", campaignId: s.campaignId, report } : s
      ),
    []
  );

  if (!fontsReady || !hostReady) {
    return (
      <View style={[styles.page, styles.splash]}>
        <Text style={styles.splashFlame}>{"\u{1F56F}️"}</Text>
      </View>
    );
  }

  // Only frame the column when the window is actually wider than a phone.
  const framed = WEB && width > WEB_COLUMN_WIDTH;

  return (
    <SafeAreaProvider>
      <View style={styles.page}>
        <View style={[styles.app, framed && styles.appFramed]}>
          <StatusBar style="light" />
          {screen.screen === "home" && <HomeScreen onEnterTable={enterTable} />}
          {screen.screen === "table" && (
            <TableScreen
              campaignId={screen.campaignId}
              onShowReport={showReport}
              onExit={goHome}
            />
          )}
          {screen.screen === "report" && (
            <ReportCardScreen
              report={screen.report}
              onDone={() => enterTable(screen.campaignId)}
            />
          )}
        </View>
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#0a0705" },
  app: {
    flex: 1,
    width: "100%",
    alignSelf: "center",
    backgroundColor: theme.bg,
    // Nothing may paint outside the app's own bounds (decorative glows included).
    overflow: "hidden",
  },
  appFramed: {
    maxWidth: WEB_COLUMN_WIDTH,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: theme.border,
  },
  splash: { alignItems: "center", justifyContent: "center" },
  splashFlame: { fontSize: 40 },
});
