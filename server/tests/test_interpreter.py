import asyncio
from firsttable.personas import load_personas
from firsttable.interpreter import heuristic_interpret, interpret
from firsttable.llm import MockProvider, LLMError


def party():
    return load_personas()


def test_name_addressing():
    h = heuristic_interpret("Wren, the keeper looks at you. What do you do?", party())
    assert h["addressed_seats"] == ["seat3"]


def test_group_check():
    h = heuristic_interpret("Roll perception, everyone", party())
    assert h["intent"] == "group_check" and h["skill"] == "perception"
    assert set(h["addressed_seats"]) == {"seat1", "seat2", "seat3"}


def test_lie_exposed_tag():
    h = heuristic_interpret("Marcus snatches the writ - it's a laundry receipt. You caught him, he's a liar.", party())
    assert "lie_exposed" in h["scene_tags"]


def test_combat_tag():
    h = heuristic_interpret("Grubb snarls and draws steel. Roll initiative!", party())
    assert "combat_start" in h["scene_tags"]


def test_interpret_falls_back(monkeypatch):
    class Boom:
        async def complete_json(self, *a, **k):
            raise LLMError("down")
    out = asyncio.run(interpret(Boom(), "Pix, stop that.", party(), []))
    assert out["addressed_seats"] == ["seat2"]


def test_interpret_validates_and_merges_combat_only(monkeypatch):
    class Weird:
        async def complete_json(self, *a, **k):
            return {"intent": "narration", "addressed_seats": ["seat9"],
                    "entities": [], "scene_tags": ["nonsense"], "skill": None}
    out = asyncio.run(interpret(Weird(), "Grubb snarls. Roll initiative!", party(), []))
    assert out["addressed_seats"] == [] and "nonsense" not in out["scene_tags"]
    assert "combat_start" in out["scene_tags"]      # unambiguous: always merged


def test_valid_llm_tags_not_polluted_by_heuristics(monkeypatch):
    # A validated LLM classification stands on its own for ambiguous tags: the
    # heuristic seeing payment-ish words must not force toll_paid into it.
    class Clean:
        async def complete_json(self, *a, **k):
            return {"intent": "npc_dialogue", "addressed_seats": [],
                    "entities": ["Grubb Marsh"], "scene_tags": [], "skill": None}
    out = asyncio.run(interpret(
        Clean(), 'Grubb growls: "Wren paid the toll for outsiders last spring, ask her."',
        party(), []))
    assert out["scene_tags"] == []


def test_toll_demand_does_not_fire_completion_tags():
    # Grubb's natural opening DEMAND must not read as the toll being paid or
    # the party having crossed — those tags irreversibly advance the beat.
    h = heuristic_interpret(
        "One silver each. Pay the toll or turn back — nobody crosses without paying.",
        party())
    assert "toll_paid" not in h["scene_tags"]
    assert "party_crosses" not in h["scene_tags"]
    h2 = heuristic_interpret("One silver a head to cross the bridge, says Grubb.", party())
    assert "party_crosses" not in h2["scene_tags"]


def test_completed_payment_and_crossing_still_fire():
    h = heuristic_interpret("Marcus sighs and hands over three silver.", party())
    assert "toll_paid" in h["scene_tags"]
    h2 = heuristic_interpret("The party crosses the bridge in single file.", party())
    assert "party_crosses" in h2["scene_tags"]
