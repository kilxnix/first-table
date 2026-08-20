import json
import pathlib
from dataclasses import dataclass, field

_CONTENT = pathlib.Path(__file__).parent / "content"


@dataclass
class Beat:
    id: str
    title: str
    dm_notes: str
    secrets: list[str]
    pressure_budget_minutes: int
    whispers: list[dict]
    advance_when: list[str]


@dataclass
class Spine:
    id: str
    title: str
    cold_open: list[dict]
    beats: list[Beat]
    npcs: dict
    clocks: list[dict] = field(default_factory=list)


def load_spine(spine_id: str = "goblin_toll") -> Spine:
    data = json.loads((_CONTENT / f"{spine_id}.json").read_text(encoding="utf-8"))
    return Spine(
        id=data["id"], title=data["title"], cold_open=data["cold_open"],
        beats=[Beat(**b) for b in data["beats"]], npcs=data["npcs"], clocks=data["clocks"],
    )
