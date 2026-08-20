export type MessageKind = "dm" | "agent" | "system" | "roll";
export interface RollResultView { formula: string; rolls: number[]; modifier: number; total: number; label: string; actor: string; outcome: string | null; }
export interface ThreadMessage { id: number; ts: number; kind: MessageKind; seat: string | null; name: string | null; speech: string | null; action: string | null; ooc: string | null; text: string | null; roll: RollResultView | null; }
export interface PartyMember { seat: string; name: string; char_class: string; ancestry: string; level: number; hp: number; max_hp: number; ac: number; mood: string; portrait: string; stats: Record<string, number>; inventory: string[]; }
export interface BeatView { id: string; title: string; status: "locked" | "active" | "done"; dm_notes: string; secrets: string[]; }
export interface ClockView { name: string; segments: number; filled: number; }
export interface NpcView { name: string; voice_note: string; secret: string; status: string; }
export interface PartyStatus { seat: string; name: string; hp: number; max_hp: number; conditions: string[]; inventory: string[]; }
export interface DMScreenState { spine_title: string; beats: BeatView[]; clocks: ClockView[]; npcs: NpcView[]; party_status: PartyStatus[]; }
export interface AxisScore { score: number; detail: string; }
export interface Report { scene_id: number; axes: { spotlight: AxisScore; pacing: AxisScore }; drill_suggestion: string; notes: string[]; }
export interface CampaignState { id: number; name: string; scene_active: boolean; scene_id: number | null; party: PartyMember[]; thread: ThreadMessage[]; dm_screen: DMScreenState; }
export type ServerFrame =
  | { type: "hello"; campaign: CampaignState }
  | { type: "message"; message: ThreadMessage }
  | { type: "typing"; seat: string; name: string }
  | { type: "typing_stop"; seat: string }
  | { type: "dm_screen"; dm_screen: DMScreenState }
  | { type: "scene"; status: "started" | "ended"; scene_id: number; report: Report | null }
  | { type: "error"; detail: string };
