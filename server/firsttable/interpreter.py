"""Interpreter: classifies each DM input (LLM with a heuristic fallback).

The heuristic path is pure code and doubles as cheap insurance: its scene
tags are always merged into the LLM output so the director never misses a
hard trigger.
"""
from . import rules
from .llm import LLMError

INTENTS = ("narration", "npc_dialogue", "question_to_party", "ruling",
           "ooc", "combat_action", "group_check")

SCENE_TAGS = ("toll_paid", "lie_exposed", "combat_start",
              "mercy_shown", "party_crosses", "stall")

_TAG_DEFINITIONS = {
    "toll_paid": "the party pays the toll (coin changes hands)",
    "lie_exposed": "the toll-keeper's lie or forged writ is called out",
    "combat_start": "violence begins or initiative is called",
    "mercy_shown": "the party shows mercy, kindness, or spares someone",
    "party_crosses": "the party crosses the bridge",
    "stall": "the scene is stalling with no forward motion",
}

INTERP_SCHEMA = {
    "type": "object",
    "properties": {
        "intent": {"type": "string", "enum": list(INTENTS)},
        "addressed_seats": {"type": "array", "items": {"type": "string"}},
        "entities": {"type": "array", "items": {"type": "string"}},
        "scene_tags": {"type": "array",
                       "items": {"type": "string", "enum": list(SCENE_TAGS)}},
        "skill": {"type": ["string", "null"]},
    },
    "required": ["intent", "addressed_seats", "entities", "scene_tags", "skill"],
    "additionalProperties": False,
}

_GROUP_WORDS = ("everyone", "you all", "party")
_COMBAT_WORDS = ("attack", "initiative", "roll for damage")
_RULING_WORDS = ("i rule", "ruling", "that works, but")
_LIE_WORDS = ("liar", "fake", "forged", "laundry receipt", "caught you")
_MERCY_WORDS = ("spare", "mercy", "let him go", "feeds", "kindness")
_CROSS_WORDS = ("cross the bridge", "across the bridge")
_PAY_WORDS = ("pay", "paid the toll", "hands over")
_TOLL_WORDS = ("toll", "silver")


def _find_skill(low: str) -> str | None:
    for skill in rules.SKILL_ABILITY:
        if skill in low or skill.replace("_", " ") in low:
            return skill
    return None


def heuristic_interpret(text: str, party: dict) -> dict:
    low = text.lower()
    seats = sorted(party)

    addressed = [seat for seat in seats
                 if party[seat].name.split()[0].lower() in low]
    if any(w in low for w in _GROUP_WORDS):
        addressed = list(seats)

    skill = _find_skill(low)

    scene_tags: list[str] = []
    if any(w in low for w in _COMBAT_WORDS):
        scene_tags.append("combat_start")
    if any(w in low for w in _PAY_WORDS) and any(w in low for w in _TOLL_WORDS):
        scene_tags.append("toll_paid")
    if any(w in low for w in _LIE_WORDS):
        scene_tags.append("lie_exposed")
    if any(w in low for w in _CROSS_WORDS):
        scene_tags.append("party_crosses")
    if any(w in low for w in _MERCY_WORDS):
        scene_tags.append("mercy_shown")

    stripped = low.strip()
    if "roll" in low and skill:
        if set(addressed) == set(seats) and seats:
            intent = "group_check"
        else:
            intent = "question_to_party"
    elif '"' in text:
        intent = "npc_dialogue"
    elif stripped.startswith("(") or stripped.startswith("ooc"):
        intent = "ooc"
    elif any(w in low for w in _RULING_WORDS):
        intent = "ruling"
    elif any(w in low for w in _COMBAT_WORDS):
        intent = "combat_action"
    else:
        intent = "narration"

    return {"intent": intent, "addressed_seats": addressed, "entities": [],
            "scene_tags": scene_tags, "skill": skill}


def _system_prompt(party: dict, recent: list[str]) -> str:
    roster = "; ".join(f"{seat} = {party[seat].name}" for seat in sorted(party))
    tags = "\n".join(f"- {tag}: {desc}" for tag, desc in _TAG_DEFINITIONS.items())
    lines = [
        "You classify one Dungeon Master utterance at a 5E-compatible tabletop game.",
        f"Party seats: {roster}.",
        f"intent is one of: {', '.join(INTENTS)}.",
        "addressed_seats: seats the DM speaks to directly (empty if none).",
        "entities: proper nouns mentioned (NPCs, places, items).",
        "scene_tags: ONLY from this closed vocabulary, when clearly present:",
        tags,
        "skill: the skill named for a check, else null.",
        "Output JSON only.",
    ]
    if recent:
        lines.append("Recent table context:\n" + "\n".join(recent[-6:]))
    return "\n".join(lines)


def _validate(raw: dict, party: dict) -> dict | None:
    """Sanitize an LLM interpretation; return None on structural failure."""
    if not isinstance(raw, dict):
        return None
    intent = raw.get("intent")
    if intent not in INTENTS:
        return None
    seats = set(party)
    addressed = [s for s in raw.get("addressed_seats") or []
                 if isinstance(s, str) and s in seats]
    entities = [e for e in raw.get("entities") or [] if isinstance(e, str)]
    scene_tags = [t for t in raw.get("scene_tags") or [] if t in SCENE_TAGS]
    skill = raw.get("skill")
    if not isinstance(skill, str) or skill not in rules.SKILL_ABILITY:
        skill = None
    return {"intent": intent, "addressed_seats": addressed, "entities": entities,
            "scene_tags": scene_tags, "skill": skill}


async def interpret(provider, text: str, party: dict, recent: list[str]) -> dict:
    heuristic = heuristic_interpret(text, party)
    try:
        raw = await provider.complete_json(
            _system_prompt(party, recent),
            [{"role": "user", "content": text}],
            INTERP_SCHEMA,
        )
    except LLMError:
        return heuristic
    out = _validate(raw, party)
    if out is None:
        return heuristic
    # Union in the heuristic scene tags: the director must never miss a
    # hard trigger because the LLM got creative.
    for tag in heuristic["scene_tags"]:
        if tag not in out["scene_tags"]:
            out["scene_tags"].append(tag)
    if out["skill"] is None:
        out["skill"] = heuristic["skill"]
    return out
