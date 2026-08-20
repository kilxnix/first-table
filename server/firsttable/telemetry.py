"""Per-scene telemetry: raw timestamps the report card is built from."""
import time
from dataclasses import dataclass, field


@dataclass
class SceneTelemetry:
    started: float = field(default_factory=time.time)
    dm_turns: list[float] = field(default_factory=list)
    agent_turns: dict[str, list[float]] = field(default_factory=dict)
    hesitations: list[tuple[str, float]] = field(default_factory=list)
    hesitations_answered: list[str] = field(default_factory=list)

    def record_dm(self, ts: float) -> None:
        self.dm_turns.append(ts)

    def record_agent(self, seat: str, ts: float) -> None:
        self.agent_turns.setdefault(seat, []).append(ts)

    def record_hesitation(self, seat: str, ts: float) -> None:
        self.hesitations.append((seat, ts))

    def record_hesitation_answered(self, seat: str) -> None:
        self.hesitations_answered.append(seat)

    def to_dict(self) -> dict:
        return {
            "started": self.started,
            "dm_turns": list(self.dm_turns),
            "agent_turns": {seat: list(ts) for seat, ts in self.agent_turns.items()},
            "hesitations": [[seat, ts] for seat, ts in self.hesitations],
            "hesitations_answered": list(self.hesitations_answered),
        }

    @classmethod
    def from_dict(cls, data: dict) -> "SceneTelemetry":
        return cls(
            started=data.get("started", 0.0),
            dm_turns=list(data.get("dm_turns", [])),
            agent_turns={seat: list(ts) for seat, ts in data.get("agent_turns", {}).items()},
            hesitations=[(seat, ts) for seat, ts in data.get("hesitations", [])],
            hesitations_answered=list(data.get("hesitations_answered", [])),
        )
