"""Turn manager: picks who speaks after each DM input (spec section 6).

Scoring: score(seat) = relevance * (0.5 + 0.5 * reactivity) * (1 + claimable_debt)
- relevance: 1.0 if addressed; 0.9 for a ruling when the seat is pedantic; 0.3 base.
- reactivity: max(chaos, pedantry, spotlight_seek clamped to [0, 1]).
- claimable_debt: debt * (1 + max(0, spotlight_seek)).
Shy seats (spotlight_seek < 0) with heavy debt surface as *hesitation* instead of
claiming the floor.
"""
import random
from dataclasses import dataclass, field


class SpotlightState:
    """Per-seat spotlight debt: accrues while silent, cleared on speaking."""

    def __init__(self, seats: list[str] | None = None):
        self._debt: dict[str, float] = {seat: 0.0 for seat in (seats or [])}

    def accrue(self, silent_seats: list[str]) -> None:
        for seat in silent_seats:
            self._debt[seat] = self._debt.get(seat, 0.0) + 1.0

    def clear(self, seat: str) -> None:
        self._debt[seat] = 0.0

    def debt(self, seat: str) -> float:
        return self._debt.get(seat, 0.0)

    def to_dict(self) -> dict:
        return dict(self._debt)

    @classmethod
    def from_dict(cls, data: dict) -> "SpotlightState":
        state = cls(list(data))
        state._debt = {seat: float(v) for seat, v in data.items()}
        return state


@dataclass
class TurnPlan:
    main: str
    interjectors: list[str] = field(default_factory=list)
    hesitation: str | None = None


def _clamp01(x: float) -> float:
    return max(0.0, min(1.0, x))


def _score(seat: str, interp: dict, personas: dict, spotlight: SpotlightState) -> float:
    p = personas[seat].personality
    if seat in interp.get("addressed_seats", []):
        relevance = 1.0
    elif interp.get("intent") == "ruling" and p["pedantry"] > 0.6:
        relevance = 0.9
    else:
        relevance = 0.3
    reactivity = max(p["chaos"], p["pedantry"], _clamp01(p["spotlight_seek"]))
    claimable_debt = spotlight.debt(seat) * (1 + max(0.0, p["spotlight_seek"]))
    return relevance * (0.5 + 0.5 * reactivity) * (1 + claimable_debt)


def plan(interp: dict, personas: dict, spotlight: SpotlightState,
         rng: random.Random) -> TurnPlan:
    seats = sorted(personas)
    scores = {seat: _score(seat, interp, personas, spotlight) for seat in seats}
    addressed = [s for s in seats if s in interp.get("addressed_seats", [])]

    interjectors: list[str] = []
    if addressed:
        main = max(addressed, key=lambda s: (scores[s], s))
        interjectors = [s for s in addressed if s != main][:2]
    else:
        main = max(seats, key=lambda s: (scores[s], s))

    for seat in seats:
        if len(interjectors) >= 2:
            break
        if seat == main or seat in interjectors:
            continue
        if rng.random() < 0.25 + 0.5 * personas[seat].personality["chaos"]:
            interjectors.append(seat)
    interjectors.sort(key=lambda s: scores[s], reverse=True)

    speakers = {main, *interjectors}
    shy = [s for s in seats
           if personas[s].personality["spotlight_seek"] < 0
           and spotlight.debt(s) >= 3
           and s not in speakers]
    hesitation = max(shy, key=lambda s: (spotlight.debt(s), s)) if shy else None

    return TurnPlan(main=main, interjectors=interjectors, hesitation=hesitation)
