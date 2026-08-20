import random
import re
from dataclasses import dataclass

_SIDES = {4, 6, 8, 10, 12, 20, 100}
_RE = re.compile(r"^(\d*)d(\d+)([+-]\d+)?$")


class DiceError(ValueError):
    pass


@dataclass
class RollResult:
    formula: str
    rolls: list[int]
    modifier: int
    total: int


def roll(formula: str, rng: random.Random) -> RollResult:
    m = _RE.match(formula.strip().lower().replace(" ", ""))
    if not m:
        raise DiceError(f"bad formula: {formula!r}")
    n = int(m.group(1) or 1)
    sides = int(m.group(2))
    mod = int(m.group(3) or 0)
    if not (1 <= n <= 20) or sides not in _SIDES:
        raise DiceError(f"bad formula: {formula!r}")
    rolls = [rng.randint(1, sides) for _ in range(n)]
    return RollResult(formula=formula.strip(), rolls=rolls, modifier=mod, total=sum(rolls) + mod)
