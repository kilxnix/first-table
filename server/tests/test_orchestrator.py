import asyncio
from firsttable.config import Config
from firsttable.db import Store
from firsttable.llm import get_provider
from firsttable.orchestrator import Table


def make_table():
    cfg = Config(provider="mock", db_path=":memory:", seed=7)
    store = Store(":memory:")
    cid = store.create_campaign("T", "goblin_toll")
    return Table(cid, store, get_provider(cfg), cfg)


def collect():
    frames = []
    async def emit(f):
        frames.append(f)
    return frames, emit


def test_cold_open_party_speaks_first():
    t = make_table()
    frames, emit = collect()
    asyncio.run(t.start_scene(emit))
    kinds = [f["type"] for f in frames]
    assert kinds[0] == "scene"
    msgs = [f for f in frames if f["type"] == "message"]
    assert len(msgs) >= 3 and all(m["message"]["kind"] == "agent" for m in msgs)
    assert any(f["type"] == "typing" for f in frames)
    assert frames[-1]["type"] == "dm_screen"


def test_dm_input_produces_agent_response():
    t = make_table()
    frames, emit = collect()
    asyncio.run(t.start_scene(emit))
    frames.clear()
    asyncio.run(t.handle_dm_input("The keeper snorts. Marcus, he's looking at you.", "text", emit))
    msgs = [f["message"] for f in frames if f["type"] == "message"]
    assert msgs[0]["kind"] == "dm"
    agent_msgs = [m for m in msgs if m["kind"] == "agent"]
    assert agent_msgs and agent_msgs[-1]["seat"] == "seat1"


def test_group_check_rolls_for_everyone():
    t = make_table()
    frames, emit = collect()
    asyncio.run(t.start_scene(emit))
    frames.clear()
    asyncio.run(t.handle_dm_input("Roll perception, everyone", "text", emit))
    rolls = [f["message"] for f in frames if f["type"] == "message" and f["message"]["kind"] == "roll"]
    assert len(rolls) == 3


def test_beat_advance_emits_dm_screen_and_system():
    t = make_table()
    frames, emit = collect()
    asyncio.run(t.start_scene(emit))
    frames.clear()
    asyncio.run(t.handle_dm_input("Marcus grabs the writ - a laundry receipt! You caught him, liar!", "text", emit))
    assert any(f["type"] == "dm_screen" for f in frames)
    sys_msgs = [f["message"] for f in frames if f["type"] == "message" and f["message"]["kind"] == "system"]
    assert any("Beat" in (m["text"] or "") for m in sys_msgs)


def test_end_scene_reports():
    t = make_table()
    frames, emit = collect()
    asyncio.run(t.start_scene(emit))
    asyncio.run(t.handle_dm_input("You see a rope bridge.", "text", emit))
    asyncio.run(t.handle_dm_input("Wren, the wind picks up.", "text", emit))
    asyncio.run(t.handle_dm_input("The keeper waits.", "text", emit))
    report = asyncio.run(t.end_scene(emit))
    assert set(report["axes"]) == {"spotlight", "pacing"}
    assert 0 <= report["axes"]["spotlight"]["score"] <= 100
    scene_frames = [f for f in frames if f["type"] == "scene" and f["status"] == "ended"]
    assert scene_frames and scene_frames[-1]["report"]["drill_suggestion"]


def test_manual_roll_and_bad_formula():
    t = make_table()
    frames, emit = collect()
    asyncio.run(t.manual_roll("2d6+1", "Luck", emit))
    assert frames[-1]["message"]["roll"]["total"] >= 3
    asyncio.run(t.manual_roll("banana", "?", emit))
    assert frames[-1]["type"] == "error"


def test_whisper_restored_when_llm_fails():
    from firsttable.llm import LLMError

    t = make_table()
    frames, emit = collect()
    asyncio.run(t.start_scene(emit))

    class Boom:
        async def complete_json(self, *a, **k):
            raise LLMError("down")

    t.provider = Boom()
    t.state["pending_whispers"]["seat2"] = ["the sign paint matches the quarry marks"]
    asyncio.run(t.handle_dm_input("Pix, the keeper glares at you.", "text", emit))
    # run_agent fell back, so the undelivered whisper must survive for next turn
    assert t.state["pending_whispers"].get("seat2") == [
        "the sign paint matches the quarry marks"]


def test_awaiting_hesitation_cleared_on_scene_end():
    t = make_table()
    frames, emit = collect()
    asyncio.run(t.start_scene(emit))
    asyncio.run(t.handle_dm_input("The wind howls.", "text", emit))
    asyncio.run(t.handle_dm_input("The bridge sways.", "text", emit))
    asyncio.run(t.handle_dm_input("Night falls.", "text", emit))
    t.state["awaiting_hesitation"] = "seat3"
    asyncio.run(t.end_scene(emit))
    assert t.state["awaiting_hesitation"] is None


def test_cold_open_done_persisted_before_lines_play():
    t = make_table()

    class Dies(Exception):
        pass

    sent = []

    async def emit(f):
        sent.append(f)
        if f["type"] == "message":            # crash after the first cold-open line
            raise Dies()

    import pytest
    with pytest.raises(Dies):
        asyncio.run(t.start_scene(emit))
    # A crash mid-cold-open must not queue a full replay in a later scene.
    assert t.store.get_campaign(t.cid)["state"]["cold_open_done"] is True
