"""Locked protocol shapes (pydantic) + message builders.

These mirror app/src/types.ts exactly — do not drift.
"""
from typing import Literal, Union

from pydantic import BaseModel


class RollResultView(BaseModel):
    formula: str
    rolls: list[int]
    modifier: int
    total: int
    label: str
    actor: str
    outcome: str | None = None


class ThreadMessage(BaseModel):
    id: int
    ts: float
    kind: Literal["dm", "agent", "system", "roll"]
    seat: str | None = None
    name: str | None = None
    speech: str | None = None
    action: str | None = None
    ooc: str | None = None
    text: str | None = None
    roll: RollResultView | None = None


class PartyMember(BaseModel):
    seat: str
    name: str
    char_class: str
    ancestry: str
    level: int
    hp: int
    max_hp: int
    ac: int
    mood: str
    portrait: str
    stats: dict[str, int]


class BeatView(BaseModel):
    id: str
    title: str
    status: Literal["locked", "active", "done"]
    dm_notes: str
    secrets: list[str]


class ClockView(BaseModel):
    name: str
    segments: int
    filled: int


class NpcView(BaseModel):
    name: str
    voice_note: str
    secret: str
    status: str


class PartyStatus(BaseModel):
    seat: str
    name: str
    hp: int
    max_hp: int
    conditions: list[str]


class DMScreenState(BaseModel):
    spine_title: str
    beats: list[BeatView]
    clocks: list[ClockView]
    npcs: list[NpcView]
    party_status: list[PartyStatus]


class AxisScore(BaseModel):
    score: int
    detail: str


class ReportAxes(BaseModel):
    spotlight: AxisScore
    pacing: AxisScore


class Report(BaseModel):
    scene_id: int
    axes: ReportAxes
    drill_suggestion: str
    notes: list[str]


class CampaignState(BaseModel):
    id: int
    name: str
    scene_active: bool
    scene_id: int | None = None
    party: list[PartyMember]
    thread: list[ThreadMessage]
    dm_screen: DMScreenState


# --- WebSocket frames -------------------------------------------------------

class HelloFrame(BaseModel):
    type: Literal["hello"] = "hello"
    campaign: CampaignState


class MessageFrame(BaseModel):
    type: Literal["message"] = "message"
    message: ThreadMessage


class TypingFrame(BaseModel):
    type: Literal["typing"] = "typing"
    seat: str
    name: str


class TypingStopFrame(BaseModel):
    type: Literal["typing_stop"] = "typing_stop"
    seat: str


class DMScreenFrame(BaseModel):
    type: Literal["dm_screen"] = "dm_screen"
    dm_screen: DMScreenState


class SceneFrame(BaseModel):
    type: Literal["scene"] = "scene"
    status: Literal["started", "ended"]
    scene_id: int
    report: Report | None = None


class ErrorFrame(BaseModel):
    type: Literal["error"] = "error"
    detail: str


ServerFrame = Union[HelloFrame, MessageFrame, TypingFrame, TypingStopFrame,
                    DMScreenFrame, SceneFrame, ErrorFrame]


class DmInputFrame(BaseModel):
    type: Literal["dm_input"] = "dm_input"
    text: str
    mode: Literal["voice", "text"] = "text"


class RollFrame(BaseModel):
    type: Literal["roll"] = "roll"
    formula: str
    label: str = "Table roll"


# --- Message builders (plain dicts in the locked ThreadMessage shape) --------

def _base(id: int, ts: float, kind: str) -> dict:
    return {"id": id, "ts": ts, "kind": kind, "seat": None, "name": None,
            "speech": None, "action": None, "ooc": None, "text": None, "roll": None}


def dm_message(id: int, ts: float, text: str) -> dict:
    msg = _base(id, ts, "dm")
    msg["text"] = text
    return msg


def agent_message(id: int, ts: float, seat: str, name: str, reply: dict) -> dict:
    msg = _base(id, ts, "agent")
    msg["seat"] = seat
    msg["name"] = name
    msg["speech"] = reply.get("speech") or ""
    msg["action"] = reply.get("action") or ""
    msg["ooc"] = reply.get("ooc") or ""
    return msg


def system_message(id: int, ts: float, text: str) -> dict:
    msg = _base(id, ts, "system")
    msg["text"] = text
    return msg


def roll_message(id: int, ts: float, roll_view: dict) -> dict:
    msg = _base(id, ts, "roll")
    msg["roll"] = roll_view
    return msg
