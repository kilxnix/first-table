import { StatusBar } from "expo-status-bar";
import { useState } from "react";
import { Platform, SafeAreaView, StyleSheet, View } from "react-native";
import { TableScreen } from "./src/screens/TableScreen";
import { theme } from "./src/theme";
import { Report } from "./src/types";

type Screen =
  | { screen: "home" }
  | { screen: "table"; campaignId: number }
  | { screen: "report"; campaignId: number; report: Report };

// Home and ReportCard screens land in the next task; until then, straight to the table.
const TEMP_CAMPAIGN_ID = 1;

export default function App() {
  const [screen, setScreen] = useState<Screen>({ screen: "table", campaignId: TEMP_CAMPAIGN_ID });

  return (
    <View style={styles.page}>
      <SafeAreaView style={styles.phone}>
        <StatusBar style="light" />
        {screen.screen !== "home" && (
          <TableScreen
            campaignId={screen.campaignId}
            onShowReport={(report) =>
              setScreen((s) =>
                s.screen === "table" ? { screen: "report", campaignId: s.campaignId, report } : s
              )
            }
          />
        )}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#0b0908" },
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
