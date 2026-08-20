import asyncio
import pytest
from firsttable.config import Config
from firsttable.llm import get_provider, extract_json, MockProvider, LLMError

AGENT_SCHEMA = {"type": "object", "properties": {
    "speech": {"type": "string"}, "action": {"type": "string"}, "ooc": {"type": "string"},
    "roll_request": {"type": ["object", "null"]}}, "required": ["speech"]}


def test_get_provider_maps():
    assert isinstance(get_provider(Config(provider="mock")), MockProvider)
    from firsttable.llm import OllamaProvider, AnthropicProvider
    assert isinstance(get_provider(Config(provider="ollama")), OllamaProvider)
    assert isinstance(get_provider(Config(provider="anthropic")), AnthropicProvider)


def test_extract_json_fenced():
    assert extract_json('```json\n{"a": 1}\n```')["a"] == 1
    assert extract_json('noise {"a": {"b": 2}} trailing')["a"]["b"] == 2
    with pytest.raises(LLMError):
        extract_json("no json here")


def test_mock_agent_reply_in_character():
    p = MockProvider()
    out = asyncio.run(p.complete_json("You are Pix, a goblin rogue...", [
        {"role": "user", "content": "The toll-keeper glares."}], AGENT_SCHEMA))
    assert out["speech"]
    outs = [asyncio.run(p.complete_json("You are Pix...", [], AGENT_SCHEMA)) for _ in range(3)]
    assert any(o.get("roll_request") for o in outs)


def test_mock_interpret_heuristics():
    p = MockProvider()
    schema = {"type": "object", "properties": {"intent": {"type": "string"}}}
    out = asyncio.run(p.complete_json("classify", [
        {"role": "user", "content": "Marcus, what do you do?"}], schema))
    assert out["intent"] and "seat1" in out["addressed_seats"]
