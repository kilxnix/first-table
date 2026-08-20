import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

/**
 * Where the table server lives. On web we assume the backend runs beside the
 * page; on a phone build the default is the dev machine's LAN address, and the
 * Home screen lets the user change it (persisted on device).
 */
const DEFAULT_HOST =
  Platform.OS === "web" && typeof window !== "undefined"
    ? window.location.hostname
    : "192.168.4.20";

const KEY = "firsttable.serverHost";

let currentHost = DEFAULT_HOST;

/**
 * Accepts "host", "host:port", or a full "http(s)://…" URL (e.g. a Cloudflare
 * tunnel). Bare hosts get http + the default port 8000; https URLs get wss.
 */
function bases(): { http: string; ws: string } {
  const entry = currentHost.replace(/\/+$/, "");
  if (/^https?:\/\//i.test(entry)) {
    return { http: entry, ws: entry.replace(/^http/i, "ws") };
  }
  // Schemeless: the default port belongs on the authority, never after a path.
  const slash = entry.indexOf("/");
  const host = slash === -1 ? entry : entry.slice(0, slash);
  const path = slash === -1 ? "" : entry.slice(slash);
  const authority = host.includes(":") ? host : `${host}:8000`;
  return { http: `http://${authority}${path}`, ws: `ws://${authority}${path}` };
}

/** Load the persisted override (call once at app start, before any request). */
export async function loadServerHost(): Promise<string> {
  try {
    const saved = await AsyncStorage.getItem(KEY);
    if (saved) currentHost = saved;
  } catch {
    // storage unavailable: stick with the default
  }
  return currentHost;
}

export function getServerHost(): string {
  return currentHost;
}

export async function setServerHost(host: string): Promise<string> {
  const trimmed = host.trim();
  currentHost = trimmed || DEFAULT_HOST;
  try {
    if (trimmed) {
      await AsyncStorage.setItem(KEY, trimmed);
    } else {
      // Clearing the field returns to the default — don't persist the
      // resolved default as if the user had chosen it.
      await AsyncStorage.removeItem(KEY);
    }
  } catch {
    // storage unavailable: the override still applies for this session
  }
  return currentHost;
}

export const httpBase = (): string => bases().http;
export const wsBase = (): string => bases().ws;
