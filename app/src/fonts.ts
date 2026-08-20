import { Alegreya_400Regular, Alegreya_400Regular_Italic, Alegreya_700Bold } from "@expo-google-fonts/alegreya";
import { Cinzel_400Regular, Cinzel_700Bold } from "@expo-google-fonts/cinzel";
import { useFonts } from "expo-font";

/** Loads the candlelit-table faces; UI renders with serif fallbacks until true. */
export function useAppFonts(): boolean {
  const [loaded] = useFonts({
    Cinzel_400Regular,
    Cinzel_700Bold,
    Alegreya_400Regular,
    Alegreya_400Regular_Italic,
    Alegreya_700Bold,
  });
  return loaded;
}
