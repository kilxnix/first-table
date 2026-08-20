"""Agent runner: one persona LLM call per selected speaker, with safe fallbacks."""
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
                "ability": {"type": "string"},
                "skill": {"type": "string"},
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


def _sanitize(raw: dict) -> dict:
    out = {}
    for key in ("speech", "action", "ooc"):
        val = raw.get(key)
        out[key] = val if isinstance(val, str) else ""
    req = raw.get("roll_request")
    if isinstance(req, dict) and req.get("kind") in ("check", "attack"):
        clean = {"kind": req["kind"]}
        for key in ("ability", "skill", "target"):
            if isinstance(req.get(key), str):
                clean[key] = req[key]
        out["roll_request"] = clean
    else:
        out["roll_request"] = None
    return out


async def run_agent(provider, persona: Persona, mode: str,
                    thread_tail: list[dict], whisper: str | None = None) -> dict:
    directive = DIRECTIVES.get(mode, DIRECTIVES["main"])
    messages = build_context(persona, thread_tail, whisper, directive)
    try:
        raw = await provider.complete_json(persona.system_prompt(), messages, AGENT_SCHEMA)
    except LLMError:
        # The table never dies mid-scene.
        return {"speech": "", "action": f"{persona.name} hesitates.",
                "ooc": "", "roll_request": None}
    if not isinstance(raw, dict):
        return {"speech": "", "action": f"{persona.name} hesitates.",
                "ooc": "", "roll_request": None}
    return _sanitize(raw)
