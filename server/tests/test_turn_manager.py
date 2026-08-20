import random
from firsttable.personas import load_personas
from firsttable.turn_manager import SpotlightState, plan


def interp(**kw):
    base = {"intent": "narration", "addressed_seats": [], "entities": [],
            "scene_tags": [], "skill": None}
    base.update(kw)
    return base


def test_addressed_seat_is_main():
    p = load_personas()
    t = plan(interp(addressed_seats=["seat3"]), p, SpotlightState(list(p)), random.Random(1))
    assert t.main == "seat3"


def test_ruling_pulls_the_rules_lawyer():
    p = load_personas()
    t = plan(interp(intent="ruling"), p, SpotlightState(list(p)), random.Random(1))
    assert t.main == "seat1"


def test_no_duplicate_speakers():
    p = load_personas()
    t = plan(interp(), p, SpotlightState(list(p)), random.Random(2))
    speakers = [t.main] + t.interjectors
    assert len(speakers) == len(set(speakers))


def test_hesitation_fires_for_silent_wren():
    p = load_personas()
    s = SpotlightState(list(p))
    for _ in range(4):
        s.accrue(["seat3"])          # Wren silent 4 turns
    t = plan(interp(addressed_seats=["seat1"]), p, s, random.Random(1))
    assert t.hesitation == "seat3" or t.main == "seat3"


def test_debt_clears_on_speaking():
    s = SpotlightState(["seat1", "seat2", "seat3"])
    s.accrue(["seat1"]); s.accrue(["seat1"])
    assert s.debt("seat1") == 2.0
    s.clear("seat1")
    assert s.debt("seat1") == 0.0


def test_deterministic_under_seed():
    p = load_personas()
    a = plan(interp(), p, SpotlightState(list(p)), random.Random(5))
    b = plan(interp(), p, SpotlightState(list(p)), random.Random(5))
    assert (a.main, a.interjectors) == (b.main, b.interjectors)
