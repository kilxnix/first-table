import random
import pytest
from firsttable.dice import roll, DiceError


def rng():
    return random.Random(7)


def test_d20_in_range():
    r = roll("d20", rng())
    assert len(r.rolls) == 1 and 1 <= r.rolls[0] <= 20
    assert r.total == r.rolls[0] and r.modifier == 0


def test_seeded_determinism():
    assert roll("2d6+3", random.Random(99)).total == roll("2d6+3", random.Random(99)).total


def test_modifier_math():
    r = roll("2d6+3", rng())
    assert r.total == sum(r.rolls) + 3 and r.modifier == 3


def test_negative_modifier():
    r = roll("1d8-1", rng())
    assert r.total == sum(r.rolls) - 1


@pytest.mark.parametrize("bad", ["", "d7", "0d6", "21d6", "2d6+", "banana", "1d6+abc"])
def test_rejects_garbage(bad):
    with pytest.raises(DiceError):
        roll(bad, rng())
