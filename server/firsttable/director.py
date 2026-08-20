"""Director: beat progression, whisper firing, threat clocks, DM screen state.

Operates on the campaign `state` dict persisted via Store.save_state:
{"beat_index": int, "dm_turn_count": int, "fired_whispers": [str],
 "clock_fill": {name: int}, "npc_hp": {name: int}, "pending_whispers": {seat: [str]}}
"""
from dataclasses import dataclass, field

from .personas import Persona
from .spine import Beat, Spine


@dataclass
class DirectorEvents:
    whispers_fired: list[dict] = field(default_factory=list)   # {seat, text}
    beat_changed: str | None = None
    clock_ticks: list[str] = field(default_factory=list)


def _active_beat(spine: Spine, state: dict) -> Beat:
    index = min(state.get("beat_index", 0), len(spine.beats) - 1)
    return spine.beats[index]


def on_dm_turn(spine: Spine, state: dict, interp: dict) -> DirectorEvents:
    events = DirectorEvents()
    state["dm_turn_count"] = state.get("dm_turn_count", 0) + 1
    tags = interp.get("scene_tags", [])

    # 1. Whisper firing for the active beat (each whisper fires once).
    beat = _active_beat(spine, state)
    fired = state.setdefault("fired_whispers", [])
    pending = state.setdefault("pending_whispers", {})
    for i, whisper in enumerate(beat.whispers):
        key = f"{beat.id}:{whisper['seat']}:{i}"
        if key in fired:
            continue
        trigger = whisper["trigger"]
        if trigger["type"] == "turn_count":
            hit = state["dm_turn_count"] >= trigger["value"]
        elif trigger["type"] == "tag":
            hit = trigger["value"] in tags
        else:
            hit = False
        if hit:
            fired.append(key)
            pending.setdefault(whisper["seat"], []).append(whisper["text"])
            events.whispers_fired.append({"seat": whisper["seat"], "text": whisper["text"]})

    # 2. Beat advance on any advance_when tag.
    index = state.get("beat_index", 0)
    if any(tag in beat.advance_when for tag in tags) and index + 1 < len(spine.beats):
        state["beat_index"] = index + 1
        state["dm_turn_count"] = 0
        events.beat_changed = spine.beats[index + 1].id

    return events


def on_scene_end(spine: Spine, state: dict) -> list[str]:
    ticked: list[str] = []
    fill = state.setdefault("clock_fill", {})
    for clock in spine.clocks:
        if not clock.get("tick_on_scene_end"):
            continue
        current = fill.get(clock["name"], 0)
        if current < clock["segments"]:
            fill[clock["name"]] = current + 1
            ticked.append(clock["name"])
    return ticked


def dm_screen_state(spine: Spine, state: dict, personas: dict[str, Persona],
                    party_hp: dict | None = None) -> dict:
    beat_index = state.get("beat_index", 0)
    beats = []
    for i, beat in enumerate(spine.beats):
        status = "done" if i < beat_index else "active" if i == beat_index else "locked"
        beats.append({"id": beat.id, "title": beat.title, "status": status,
                      "dm_notes": beat.dm_notes, "secrets": list(beat.secrets)})
    clocks = [{"name": c["name"], "segments": c["segments"],
               "filled": state.get("clock_fill", {}).get(c["name"], 0)}
              for c in spine.clocks]
    npcs = [{"name": name, "voice_note": npc["voice_note"], "secret": npc["secret"],
             "status": npc["status"]}
            for name, npc in spine.npcs.items()]
    party_hp = party_hp or {}
    party_status = []
    for seat in sorted(personas):
        persona = personas[seat]
        party_status.append({
            "seat": seat, "name": persona.name,
            "hp": party_hp.get(seat, persona.sheet["hp"]),
            "max_hp": persona.sheet["max_hp"],
            "conditions": [],
        })
    return {"spine_title": spine.title, "beats": beats, "clocks": clocks,
            "npcs": npcs, "party_status": party_status}
