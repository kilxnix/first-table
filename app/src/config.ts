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

/**
 * Server pointer: a tiny hosted JSON ({"host": "https://…"}) naming the
 * table's CURRENT public URL. The free tunnel URL rotates on restart, so
 * fresh installs resolve it at launch instead of baking a stale address.
 * A user-saved override always wins and skips the lookup.
 */
const POINTER_URL =
  "https://gist.githubusercontent.com/kilxnix/ef10ece5c776378d6a3781fe13b155a3/raw/server.json";
const POINTER_TIMEOUT_MS = 5000;

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

async function resolvePointer(): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), POINTER_TIMEOUT_MS);
  try {
    const res = await fetch(`${POINTER_URL}?t=${Date.now()}`, { signal: controller.signal });
    if (!res.ok) return null;
    const data = (await res.json()) as { host?: unknown };
    return typeof data.host === "string" && data.host.trim() ? data.host.trim() : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Resolve the server at app start: saved override > pointer > built-in
 * default. The pointer result is NOT persisted, so every launch re-resolves
 * the current public URL. */
export async function loadServerHost(): Promise<string> {
  try {
    const saved = await AsyncStorage.getItem(KEY);
    if (saved) {
      currentHost = saved;
      return currentHost;
    }
  } catch {
    // storage unavailable: continue with pointer/default
  }
  if (Platform.OS !== "web") {
    const pointed = await resolvePointer();
    if (pointed) currentHost = pointed;
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
