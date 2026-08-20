from firsttable.personas import load_personas
from firsttable.spine import load_spine


def test_three_seats():
    p = load_personas()
    assert set(p) == {"seat1", "seat2", "seat3"}
    assert p["seat1"].name == "Marcus Veyle"
    assert p["seat2"].personality["chaos"] > 0.7
    assert p["seat3"].personality["spotlight_seek"] < 0


def test_sheets_are_rules_compatible():
    from firsttable import rules
    import random
    for persona in load_personas().values():
        r = rules.ability_check(persona.sheet, "wis", "perception", random.Random(1))
        assert "total" in r
        rules.attack_roll(persona.sheet, 12, random.Random(1))


def test_system_prompt_mentions_identity():
    p = load_personas()["seat2"]
    sp = p.system_prompt()
    assert "Pix" in sp and "JSON" in sp


def test_spine_shape():
    s = load_spine()
    assert s.title == "The Goblin Toll"
    assert len(s.beats) == 2
    assert s.beats[0].id == "beat1" and s.beats[1].id == "beat2"
    assert len(s.cold_open) >= 3
    assert "Grubb Marsh" in s.npcs
    assert s.clocks[0]["segments"] == 4
    assert any(w["seat"] == "seat2" for w in s.beats[0].whispers)


def test_no_wotc_product_identity():
    import json, pathlib
    root = pathlib.Path(__file__).parent.parent / "firsttable" / "content"
    blob = " ".join(p.read_text(encoding="utf-8") for p in root.glob("*.json")).lower()
    for banned in ["dungeons & dragons", "d&d", "beholder", "mind flayer", "strahd", "faerun", "forgotten realms"]:
        assert banned not in blob
