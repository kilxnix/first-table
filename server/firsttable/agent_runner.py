"""Agent runner: one persona LLM call per selected speaker, with safe fallbacks."""
from . import rules
from .llm import LLMError
from .personas import Persona

AGENT_SCHEMA = {
    "type": "object",
    "properties": {
        "speech": {"type": "string"},
        "action": {"type": "string"},
        "ooc": {"type": "string"},
        "roll_request": {
            "type": ["object", "null"],
            "properties": {
                "kind": {"type": "string", "enum": ["check", "attack"]},
                "ability": {"type": "string", "enum": list(rules.ABILITIES)},
                "skill": {"type": "string", "enum": sorted(rules.SKILL_ABILITY)},
                "target": {"type": "string"},
            },
            "required": ["kind"],
            "additionalProperties": False,
        },
    },
    "required": ["speech", "action", "ooc", "roll_request"],
    "additionalProperties": False,
}

DIRECTIVES = {
    "main": "Respond in character to the DM now.",
    "interject": "One short interjection only — a single line, under 20 words.",
    "hesitate": ("You almost speak but hold back. One brief action only, "
                 "no speech (or a trailing, unfinished half-sentence)."),
}

TAIL_LIMIT = 12


def _render_message(msg: dict) -> str:
    kind = msg.get("kind")
    if kind == "dm":
        return f"DM: {msg.get('text') or ''}"
    if kind == "agent":
        name = msg.get("name") or msg.get("seat") or "?"
        line = f"{name}: {msg.get('speech') or ''}"
        if msg.get("action"):
            line += f" ({msg['action']})"
        return line
    if kind == "roll":
        r = msg.get("roll") or {}
        return (f"[roll] {r.get('label', '')} by {r.get('actor', '')}: "
                f"{r.get('total', '')} {r.get('outcome') or ''}").strip()
    return f"[{msg.get('text') or ''}]"


def build_context(persona: Persona, thread_tail: list[dict],
                  whisper: str | None, directive: str) -> list[dict]:
    tail = thread_tail[-TAIL_LIMIT:]
    parts = ["RECENT TABLE:"]
    parts += [_render_message(m) for m in tail]
    if whisper:
        parts.append(f"PRIVATE WHISPER (only you know this): {whisper}")
    parts.append(f"DIRECTIVE: {directive}")
    return [{"role": "user", "content": "\n".join(parts)}]


def _normalize_skill(val: str) -> str | None:
    skill = val.lower().strip().replace(" ", "_")
    return skill if skill in rules.SKILL_ABILITY else None


def _normalize_ability(val: str) -> str | None:
    ability = val.lower().strip()
    if ability not in rules.ABILITIES:
        ability = ability[:3]           # "dexterity" -> "dex", etc.
    return ability if ability in rules.ABILITIES else None


def _sanitize(raw: dict) -> dict:
    out = {}
    for key in ("speech", "action", "ooc"):
        val = raw.get(key)
        out[key] = val if isinstance(val, str) else ""
    req = raw.get("roll_request")
    out["roll_request"] = None
    if isinstance(req, dict) and req.get("kind") in ("check", "attack"):
        clean: dict = {"kind": req["kind"]}
        if isinstance(req.get("skill"), str):
            skill = _normalize_skill(req["skill"])
            if skill:
                clean["skill"] = skill
        if isinstance(req.get("ability"), str):
            ability = _normalize_ability(req["ability"])
            if ability:
                clean["ability"] = ability
        if isinstance(req.get("target"), str):
            clean["target"] = req["target"]
        # A check with neither a canonical skill nor ability cannot resolve;
        # drop it rather than let it vanish downstream as a RulesError.
        if clean["kind"] == "check" and "skill" not in clean and "ability" not in clean:
            return out
        out["roll_request"] = clean
    return out


async def run_agent(provider, persona: Persona, mode: str,
                    thread_tail: list[dict], whisper: str | None = None) -> dict:
    directive = DIRECTIVES.get(mode, DIRECTIVES["main"])
    messages = build_context(persona, thread_tail, whisper, directive)
    try:
        raw = await provider.complete_json(persona.system_prompt(), messages, AGENT_SCHEMA)
    except LLMError:
        # The table never dies mid-scene. "_fallback" tells the orchestrator the
        # LLM never saw this turn (so e.g. an undelivered whisper can be restored).
        return {"speech": "", "action": f"{persona.name} hesitates.",
                "ooc": "", "roll_request": None, "_fallback": True}
    if not isinstance(raw, dict):
        return {"speech": "", "action": f"{persona.name} hesitates.",
                "ooc": "", "roll_request": None, "_fallback": True}
    return _sanitize(raw)
