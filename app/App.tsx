import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useState } from "react";
import { Platform, SafeAreaView, StyleSheet, Text, View } from "react-native";
import { loadServerHost } from "./src/config";
import { useAppFonts } from "./src/fonts";
import { HomeScreen } from "./src/screens/HomeScreen";
import { ReportCardScreen } from "./src/screens/ReportCardScreen";
import { TableScreen } from "./src/screens/TableScreen";
import { theme } from "./src/theme";
import { Report } from "./src/types";

type Screen =
  | { screen: "home" }
  | { screen: "table"; campaignId: number }
  | { screen: "report"; campaignId: number; report: Report };

export default function App() {
  const fontsReady = useAppFonts();
  const [hostReady, setHostReady] = useState(false);
  const [screen, setScreen] = useState<Screen>({ screen: "home" });

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

  return (
    <View style={styles.page}>
      <SafeAreaView style={styles.phone}>
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
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#0a0705" },
  splash: { alignItems: "center", justifyContent: "center" },
  splashFlame: { fontSize: 40 },
  phone: {
    flex: 1,
    width: "100%",
    maxWidth: 520,
    alignSelf: "center",
    backgroundColor: theme.bg,
    ...(Platform.OS === "web"
      ? { borderLeftWidth: 1, borderRightWidth: 1, borderColor: theme.border }
      : null),
  },
});
