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


def test_interpret_validates_and_merges(monkeypatch):
    class Weird:
        async def complete_json(self, *a, **k):
            return {"intent": "narration", "addressed_seats": ["seat9"],
                    "entities": [], "scene_tags": ["nonsense"], "skill": None}
    out = asyncio.run(interpret(Weird(), "They pay the toll in silver.", party(), []))
    assert out["addressed_seats"] == [] and "nonsense" not in out["scene_tags"]
    assert "toll_paid" in out["scene_tags"]
