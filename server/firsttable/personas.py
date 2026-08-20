import json
import pathlib
from dataclasses import dataclass

_CONTENT = pathlib.Path(__file__).parent / "content"


@dataclass
class Persona:
    seat: str
    name: str
    char_class: str
    ancestry: str
    portrait: str
    voice_style: str
    personality: dict
    agendas: dict
    sheet: dict

    def system_prompt(self) -> str:
        p = self.personality
        return (
            f"You are {self.name}, a level-1 {self.ancestry} {self.char_class}, a PLAYER "
            f"CHARACTER at a 5E-compatible tabletop game. A human DM runs the world; "
            f"you play ONLY {self.name}.\n"
            f"Voice: {self.voice_style}\n"
            f"Public goal: {self.agendas['public_goal']}\n"
            f"Private secret (never state outright, let it leak): {self.agendas['private_secret']}\n"
            f"This session you want: {self.agendas['session_want']}\n"
            f"Behavior dials (0-1): chaos={p['chaos']} (going off-script), pedantry={p['pedantry']} "
            f"(challenging rulings, citing rules), spotlight={p['spotlight_seek']} "
            f"(negative = shy, defers, speaks briefly), risk={p['risk']}.\n"
            f"Stats: {json.dumps(self.sheet['stats'])}. AC {self.sheet['ac']}, "
            f"HP {self.sheet['hp']}/{self.sheet['max_hp']}. "
            f"Proficient: {', '.join(self.sheet['proficiencies'])}.\n"
            f"You carry: {', '.join(self.sheet.get('inventory', []))}. "
            "Only use items you actually carry.\n"
            "HARD RULES:\n"
            "- Stay in character. PG-13 always.\n"
            "- NEVER narrate the world, other characters, or NPC decisions — that is the DM's job.\n"
            "- NEVER roll dice or state roll results. To attempt something uncertain, set roll_request.\n"
            "- Keep speech under 60 words. Interjections under 20 words.\n"
            "- Output ONLY JSON: {\"speech\": str, \"action\": str, \"ooc\": str, "
            "\"roll_request\": null | {\"kind\": \"check\"|\"attack\", \"ability\"?: str, "
            "\"skill\"?: str, \"target\"?: str}}.\n"
            "speech = words said aloud in character. action = short third-person physical action. "
            "ooc = out-of-character table talk (usually empty). Use roll_request sparingly. "
            "skill must be snake_case from: perception, stealth, persuasion, deception, insight, "
            "investigation, athletics, arcana, sleight_of_hand, intimidation, religion, survival; "
            "ability is one of: str, dex, con, int, wis, cha."
        )


def load_personas() -> dict[str, Persona]:
    data = json.loads((_CONTENT / "personas.json").read_text(encoding="utf-8"))
    return {seat: Persona(seat=seat, **fields) for seat, fields in data.items()}
