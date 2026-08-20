"""LLM provider abstraction: mock (deterministic, offline), ollama, anthropic."""
import abc
import json

import httpx

from .config import Config


class LLMError(RuntimeError):
    pass


def extract_json(text: str) -> dict:
    """Lenient JSON extraction: strips code fences, finds the first balanced object."""
    if not isinstance(text, str):
        raise LLMError("no JSON found in non-string response")
    s = text.strip()
    if s.startswith("```"):
        s = s.strip("`").strip()
        if s.lower().startswith("json"):
            s = s[4:]
    start = s.find("{")
    if start == -1:
        raise LLMError(f"no JSON object found in: {text[:80]!r}")
    depth = 0
    for i in range(start, len(s)):
        if s[i] == "{":
            depth += 1
        elif s[i] == "}":
            depth -= 1
            if depth == 0:
                try:
                    return json.loads(s[start:i + 1])
                except json.JSONDecodeError as exc:
                    raise LLMError(f"bad JSON in response: {exc}") from exc
    raise LLMError(f"unbalanced JSON object in: {text[:80]!r}")


class LLMProvider(abc.ABC):
    @abc.abstractmethod
    async def complete_json(self, system: str, messages: list[dict], schema: dict) -> dict:
        """messages are {"role": "user"|"assistant", "content": str}."""


_MOCK_LINES: dict[str, list[dict]] = {
    "Marcus": [
        {"speech": "Technically, a legal toll requires a stamped writ. I'd like to see it.",
         "action": "adjusts his satchel and squints at the toll sign",
         "ooc": "", "roll_request": None},
        {"speech": "I have read the baronial code twice. This arrangement is... irregular.",
         "action": "narrows his eyes at the keeper", "ooc": "", "roll_request": None},
        {"speech": "As I said. Irregular. Someone should be taking notes.",
         "action": "folds his arms", "ooc": "", "roll_request": None},
    ],
    "Pix": [
        {"speech": "Pix has questions. Pix has SO many questions.",
         "action": "sidles a half-step closer to the toll box",
         "ooc": "", "roll_request": None},
        {"speech": "Ooh. What's THAT? Nobody's watching that, right?",
         "action": "fingers twitching toward the shiny thing", "ooc": "",
         "roll_request": {"kind": "check", "skill": "sleight_of_hand"}},
        {"speech": "Fine, fine. Pix was just LOOKING.",
         "action": "backs away, palms out", "ooc": "", "roll_request": None},
    ],
    "Wren": [
        {"speech": "I... maybe we shouldn't start trouble?",
         "action": "clutches the censer at her belt", "ooc": "", "roll_request": None},
        {"speech": "If it helps... I can pay. I have some coin left.",
         "action": "half-raises her hand, then lowers it", "ooc": "", "roll_request": None},
        {"speech": "...Sorry. Never mind.",
         "action": "looks down at her boots", "ooc": "", "roll_request": None},
    ],
    "default": [
        {"speech": "Right behind you.", "action": "glances at the others",
         "ooc": "", "roll_request": None},
        {"speech": "Let's not do anything hasty.", "action": "keeps to the back",
         "ooc": "", "roll_request": None},
        {"speech": "Well. That happened.", "action": "shrugs",
         "ooc": "", "roll_request": None},
    ],
}


def _fallback_interpret(text: str, party: dict) -> dict:
    """Minimal heuristic used only until firsttable.interpreter (Task 9) exists."""
    low = text.lower()
    addressed = [seat for seat in sorted(party)
                 if party[seat].name.split()[0].lower() in low]
    if any(phrase in low for phrase in ("everyone", "you all", "party")):
        addressed = sorted(party)
    return {"intent": "narration", "addressed_seats": addressed,
            "entities": [], "scene_tags": [], "skill": None}


class MockProvider(LLMProvider):
    """Deterministic, no network. Inspects the schema to pick a behavior."""

    def __init__(self, cfg: Config | None = None):
        self.cfg = cfg
        self._counts: dict[str, int] = {}

    async def complete_json(self, system: str, messages: list[dict], schema: dict) -> dict:
        props = schema.get("properties", {})
        if "intent" in props:
            return self._interpret(messages)
        if "speech" in props:
            return self._agent_reply(system)
        raise LLMError(f"mock provider cannot satisfy schema: {sorted(props)}")

    def _interpret(self, messages: list[dict]) -> dict:
        text = next((m.get("content", "") for m in reversed(messages)
                     if m.get("role") == "user"), "")
        from .personas import load_personas
        party = load_personas()
        try:
            from .interpreter import heuristic_interpret  # import here to avoid a cycle
        except ImportError:
            return _fallback_interpret(text, party)
        return heuristic_interpret(text, party)

    def _agent_reply(self, system: str) -> dict:
        name = next((n for n in ("Marcus", "Pix", "Wren") if n in system), "default")
        i = self._counts.get(name, 0)
        self._counts[name] = i + 1
        lines = _MOCK_LINES[name]
        reply = dict(lines[i % len(lines)])
        if reply.get("roll_request"):
            reply["roll_request"] = dict(reply["roll_request"])
        return reply


class OllamaProvider(LLMProvider):
    def __init__(self, cfg: Config):
        self.cfg = cfg

    async def complete_json(self, system: str, messages: list[dict], schema: dict) -> dict:
        body = {
            "model": self.cfg.ollama_model,
            "messages": [{"role": "system", "content": system}] + messages,
            "format": schema,
            "stream": False,
            "options": {"temperature": 0.8},
        }
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                resp = await client.post(f"{self.cfg.ollama_url}/api/chat", json=body)
                resp.raise_for_status()
                data = resp.json()
        except httpx.HTTPError as exc:
            raise LLMError(f"ollama request failed: {exc}") from exc
        try:
            return extract_json(data["message"]["content"])
        except (KeyError, TypeError, ValueError) as exc:
            raise LLMError(f"ollama response unparseable: {exc}") from exc


class AnthropicProvider(LLMProvider):
    def __init__(self, cfg: Config):
        self.cfg = cfg
        self._client = None

    async def complete_json(self, system: str, messages: list[dict], schema: dict) -> dict:
        import anthropic
        if self._client is None:
            self._client = anthropic.AsyncAnthropic()
        try:
            resp = await self._client.messages.create(
                model=self.cfg.anthropic_model,
                max_tokens=1024,
                # cache_control on the system block gets persona prompt caching
                # for free (spec section 10).
                system=[{"type": "text", "text": system,
                         "cache_control": {"type": "ephemeral"}}],
                messages=messages,
                output_config={"format": {"type": "json_schema", "schema": schema}},
            )
        except anthropic.APIError as exc:
            raise LLMError(f"anthropic request failed: {exc}") from exc
        for block in resp.content:
            if getattr(block, "type", "") == "text":
                try:
                    return json.loads(block.text)
                except ValueError as exc:
                    raise LLMError(f"anthropic response unparseable: {exc}") from exc
        raise LLMError("anthropic response had no text block")


def get_provider(cfg: Config) -> LLMProvider:
    if cfg.provider == "mock":
        return MockProvider(cfg)
    if cfg.provider == "ollama":
        return OllamaProvider(cfg)
    if cfg.provider == "anthropic":
        return AnthropicProvider(cfg)
    if cfg.provider == "hub":
        # Lazy import: hub imports LLMProvider/LLMError from this module.
        from dataclasses import replace

        from . import hub

        if cfg.hub_fallback == "hub":
            raise LLMError("hub_fallback cannot itself be 'hub'")
        fallback = get_provider(replace(cfg, provider=cfg.hub_fallback))
        return hub.RemoteProvider(hub.queue, fallback)
    raise LLMError(f"unknown provider: {cfg.provider!r}")
