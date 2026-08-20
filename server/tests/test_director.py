from firsttable.spine import load_spine
from firsttable.personas import load_personas
from firsttable.director import on_dm_turn, on_scene_end, dm_screen_state


def fresh_state():
    return {"beat_index": 0, "dm_turn_count": 0, "fired_whispers": [],
            "clock_fill": {}, "npc_hp": {}, "pending_whispers": {}}


def interp(tags=(), intent="narration"):
    return {"intent": intent, "addressed_seats": [], "entities": [],
            "scene_tags": list(tags), "skill": None}


def test_turn_count_whisper_fires_once():
    spine, state = load_spine(), fresh_state()
    on_dm_turn(spine, state, interp())
    ev = on_dm_turn(spine, state, interp())
    assert any(w["seat"] == "seat2" for w in ev.whispers_fired)
    ev2 = on_dm_turn(spine, state, interp())
    assert all(w["seat"] != "seat2" for w in ev2.whispers_fired)
    assert state["pending_whispers"]["seat2"]


def test_beat_advances_on_tag():
    spine, state = load_spine(), fresh_state()
    ev = on_dm_turn(spine, state, interp(tags=["lie_exposed"]))
    assert ev.beat_changed == "beat2" and state["beat_index"] == 1


def test_tag_whisper_fires_on_the_advancing_turn():
    # The turn that starts combat both advances to beat2 AND delivers beat2's
    # combat_start whispers — the tag may never legitimately recur mid-combat.
    spine, state = load_spine(), fresh_state()
    ev = on_dm_turn(spine, state, interp(tags=["combat_start"]))
    assert ev.beat_changed == "beat2"
    assert {w["seat"] for w in ev.whispers_fired} == {"seat2", "seat3"}
    ev2 = on_dm_turn(spine, state, interp(tags=["combat_start"]))
    assert ev2.whispers_fired == []          # beat-scoped keys: fire once


def test_turn_count_triggers_wait_after_advance():
    # dm_turn_count resets on advance, so a new beat's turn-count whispers
    # (none in beat2, but the invariant matters) cannot fire prematurely.
    spine, state = load_spine(), fresh_state()
    on_dm_turn(spine, state, interp(tags=["lie_exposed"]))
    assert state["dm_turn_count"] == 0


def test_clock_ticks_on_scene_end():
    spine, state = load_spine(), fresh_state()
    ticked = on_scene_end(spine, state)
    assert ticked == ["The Redtooth Muster"] and state["clock_fill"]["The Redtooth Muster"] == 1
    for _ in range(10):
        on_scene_end(spine, state)
    assert state["clock_fill"]["The Redtooth Muster"] == 4


def test_dm_screen_shape():
    spine, state = load_spine(), fresh_state()
    scr = dm_screen_state(spine, state, load_personas())
    assert scr["beats"][0]["status"] == "active" and scr["beats"][1]["status"] == "locked"
    assert scr["clocks"][0]["filled"] == 0
    assert {n["name"] for n in scr["npcs"]} == {"Grubb Marsh", "Nib"}
    assert len(scr["party_status"]) == 3


def test_party_status_includes_inventory():
    spine, state = load_spine(), fresh_state()
    scr = dm_screen_state(spine, state, load_personas())
    for member in scr["party_status"]:
        assert isinstance(member["inventory"], list) and member["inventory"]
