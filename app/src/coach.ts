import { ThreadMessage } from "./types";

/**
 * The optional guided first run: a handful of corner-coach tips shown over the
 * first real scene. Entirely client-side — triggers watch the thread the app
 * already has, and nothing is written into campaign history.
 */

export type CoachPref = "on" | "off" | null;

const PREF_KEY = "firsttable.coach";

// localStorage on web; harmless in-memory fallback elsewhere.
let memoryPref: CoachPref = null;

function storage(): Storage | null {
  try {
    return typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    return null;
  }
}

export function getCoachPref(): CoachPref {
  const s = storage();
  if (!s) return memoryPref;
  const v = s.getItem(PREF_KEY);
  return v === "on" || v === "off" ? v : null;
}

export function setCoachPref(pref: Exclude<CoachPref, null>): void {
  memoryPref = pref;
  storage()?.setItem(PREF_KEY, pref);
}

export interface CoachStep {
  id: string;
  text: string;
  /** True once the table state makes this tip relevant. */
  trigger: (thread: ThreadMessage[], sceneActive: boolean) => boolean;
}

const count = (thread: ThreadMessage[], kind: ThreadMessage["kind"]) =>
  thread.filter((m) => m.kind === kind).length;

export const COACH_STEPS: CoachStep[] = [
  {
    id: "react",
    text:
      "They're talking to you. You don't need a plan — describe what the party " +
      "sees, or just answer Pix. Hold 🎤 to speak, or type below.",
    trigger: (thread, sceneActive) =>
      sceneActive && count(thread, "agent") >= 3 && count(thread, "dm") === 0,
  },
  {
    id: "loop",
    text:
      "That's the loop: you narrate, the table answers. Whoever you name speaks " +
      "first. Your beats, secrets, and clocks live behind 🛡️ DM Screen.",
    trigger: (thread) => {
      const firstDm = thread.findIndex((m) => m.kind === "dm");
      if (firstDm < 0) return false;
      return thread.some((m, i) => i > firstDm && m.kind === "agent");
    },
  },
  {
    id: "dice",
    text:
      "The table rolls its own dice — players only ask, the server rolls. " +
      "Your job is to narrate what the numbers mean.",
    trigger: (thread) => count(thread, "roll") >= 1,
  },
  {
    id: "beat",
    text:
      "The story just moved because of what happened at the table, not a script. " +
      "Check the DM Screen — a new beat's notes and secrets are open.",
    trigger: (thread) =>
      thread.some((m) => m.kind === "system" && (m.text ?? "").includes("[Beat:")),
  },
  {
    id: "wrap",
    text:
      "Scenes run 10–20 minutes. When a beat resolves, end the scene from the " +
      "header — you'll get a report card on your spotlight and pacing.",
    trigger: (thread) => thread.length >= 12,
  },
];

/**
 * The next tip to show: the earliest step whose trigger fired and that hasn't
 * been dismissed. Steps are sequential — later tips wait for earlier ones so
 * the DM is never stacked with cards.
 */
export function nextCoachStep(
  thread: ThreadMessage[],
  sceneActive: boolean,
  dismissed: ReadonlySet<string>
): CoachStep | null {
  for (const step of COACH_STEPS) {
    if (dismissed.has(step.id)) continue;
    return step.trigger(thread, sceneActive) ? step : null;
  }
  return null;
}
