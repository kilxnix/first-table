import random
import pytest
from firsttable import rules

SHEET = {
    "stats": {"str": 8, "dex": 14, "con": 14, "int": 16, "wis": 12, "cha": 10},
    "proficiencies": ["arcana", "investigation"],
    "level": 1, "ac": 12, "hp": 8, "max_hp": 8,
    "attack": {"name": "Dagger", "ability": "dex", "damage": "1d4+2"},
}


def test_ability_mod():
    assert rules.ability_mod(8) == -1
    assert rules.ability_mod(10) == 0
    assert rules.ability_mod(16) == 3
    assert rules.ability_mod(15) == 2


def test_check_unproficient():
    r = rules.ability_check(SHEET, "wis", "perception", random.Random(1))
    assert r["modifier"] == 1 and r["proficient"] is False
    assert r["total"] == r["rolls"][0] + 1


def test_check_proficient():
    r = rules.ability_check(SHEET, "int", "arcana", random.Random(1))
    assert r["modifier"] == 3 + 2 and r["proficient"] is True


def test_check_skill_only_infers_ability():
    r = rules.resolve_roll_request(SHEET, {"kind": "check", "skill": "perception"}, {}, random.Random(1))
    assert "outcome" in r and r["modifier"] == 1


def test_unknown_ability_raises():
    with pytest.raises(rules.RulesError):
        rules.ability_check(SHEET, "luck", None, random.Random(1))


def test_attack_crit_on_nat20():
    class Fixed:
        def randint(self, a, b):
            return 20
    r = rules.attack_roll(SHEET, target_ac=30, rng=Fixed())
    assert r["crit"] is True and r["hit"] is True


def test_attack_nat1_misses():
    class Fixed:
        def randint(self, a, b):
            return 1
    r = rules.attack_roll(SHEET, target_ac=2, rng=Fixed())
    assert r["hit"] is False


def test_resolve_attack_vs_npc():
    r = rules.resolve_roll_request(SHEET, {"kind": "attack", "target": "Grubb Marsh"},
                                   {"Grubb Marsh": {"ac": 13, "hp": 11}}, random.Random(3))
    assert r["outcome"].startswith(("hit", "miss", "crit"))
