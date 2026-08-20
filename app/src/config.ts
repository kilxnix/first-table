import { Platform } from "react-native";
const host = Platform.OS === "web" && typeof window !== "undefined" ? window.location.hostname : "localhost";
export const SERVER_HTTP = `http://${host}:8000`;
export const SERVER_WS = `ws://${host}:8000`;
