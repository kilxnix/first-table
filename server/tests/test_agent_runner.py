import asyncio
from firsttable.personas import load_personas
from firsttable.agent_runner import run_agent, build_context, AGENT_SCHEMA
from firsttable.llm import MockProvider, LLMError


def test_context_includes_whisper_and_tail():
    p = load_personas()["seat2"]
    msgs = build_context(p, [{"kind": "dm", "text": "The keeper waits."}], "The sign is fake.", "Respond in character to the DM now.")
    body = msgs[-1]["content"]
    assert "PRIVATE WHISPER" in body and "The keeper waits." in body and "DIRECTIVE" in body


def test_run_agent_mock_roundtrip():
    p = load_personas()["seat1"]
    out = asyncio.run(run_agent(MockProvider(), p, "main", [{"kind": "dm", "text": "A toll?"}]))
    assert isinstance(out["speech"], str) and "roll_request" in out


def test_run_agent_survives_llm_failure():
    class Boom:
        async def complete_json(self, *a, **k):
            raise LLMError("down")
    p = load_personas()["seat3"]
    out = asyncio.run(run_agent(Boom(), p, "main", []))
    assert out["action"] and out["roll_request"] is None


def test_bad_roll_request_dropped():
    class Weird:
        async def complete_json(self, *a, **k):
            return {"speech": "hi", "action": "", "ooc": "", "roll_request": {"kind": "fireball"}}
    p = load_personas()["seat1"]
    out = asyncio.run(run_agent(Weird(), p, "main", []))
    assert out["roll_request"] is None


def test_roll_request_skill_normalized():
    class Natural:
        async def complete_json(self, *a, **k):
            return {"speech": "Watch this.", "action": "", "ooc": "",
                    "roll_request": {"kind": "check", "skill": "Sleight of Hand"}}
    p = load_personas()["seat2"]
    out = asyncio.run(run_agent(Natural(), p, "main", []))
    assert out["roll_request"] == {"kind": "check", "skill": "sleight_of_hand"}


def test_roll_request_full_ability_name_normalized():
    class Natural:
        async def complete_json(self, *a, **k):
            return {"speech": "", "action": "", "ooc": "",
                    "roll_request": {"kind": "check", "ability": "Dexterity"}}
    p = load_personas()["seat2"]
    out = asyncio.run(run_agent(Natural(), p, "main", []))
    assert out["roll_request"] == {"kind": "check", "ability": "dex"}


def test_unresolvable_check_dropped_not_crashed():
    class Garbage:
        async def complete_json(self, *a, **k):
            return {"speech": "", "action": "", "ooc": "",
                    "roll_request": {"kind": "check", "skill": "vibes"}}
    p = load_personas()["seat1"]
    out = asyncio.run(run_agent(Garbage(), p, "main", []))
    assert out["roll_request"] is None


def test_fallback_reply_is_marked():
    class Boom:
        async def complete_json(self, *a, **k):
            raise LLMError("down")
    p = load_personas()["seat3"]
    out = asyncio.run(run_agent(Boom(), p, "main", []))
    assert out.get("_fallback") is True


def test_normal_reply_not_marked():
    p = load_personas()["seat1"]
    out = asyncio.run(run_agent(MockProvider(), p, "main", []))
    assert "_fallback" not in out
