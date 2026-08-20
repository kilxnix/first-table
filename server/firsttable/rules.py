import random
from .dice import roll, DiceError

PROFICIENCY = 2

SKILL_ABILITY = {
    "perception": "wis", "stealth": "dex", "persuasion": "cha", "deception": "cha",
    "insight": "wis", "investigation": "int", "athletics": "str", "arcana": "int",
    "sleight_of_hand": "dex", "intimidation": "cha", "religion": "int", "survival": "wis",
}
ABILITIES = ("str", "dex", "con", "int", "wis", "cha")


class RulesError(ValueError):
    pass


def ability_mod(score: int) -> int:
    return (score - 10) // 2


def ability_check(sheet: dict, ability: str, skill: str | None, rng: random.Random) -> dict:
    ability = (ability or "").lower()
    if ability not in ABILITIES:
        raise RulesError(f"unknown ability: {ability!r}")
    mod = ability_mod(sheet["stats"][ability])
    proficient = bool(skill) and skill in sheet.get("proficiencies", [])
    if proficient:
        mod += PROFICIENCY
    r = roll("d20", rng)
    label = f"{skill.replace('_', ' ').title()} check" if skill else f"{ability.upper()} check"
    return {"formula": f"d20{mod:+d}" if mod else "d20", "rolls": r.rolls,
            "modifier": mod, "total": r.rolls[0] + mod, "label": label, "proficient": proficient}


def attack_roll(sheet: dict, target_ac: int, rng) -> dict:
    atk = sheet["attack"]
    mod = ability_mod(sheet["stats"][atk["ability"]]) + PROFICIENCY
    r = roll("d20", rng)
    nat = r.rolls[0]
    crit = nat == 20
    hit = crit or (nat != 1 and nat + mod >= target_ac)
    return {"formula": f"d20{mod:+d}", "rolls": r.rolls, "modifier": mod,
            "total": nat + mod, "hit": hit, "crit": crit, "label": f"{atk['name']} attack"}


def damage_roll(sheet: dict, crit: bool, rng) -> dict:
    formula = sheet["attack"]["damage"]
    first = roll(formula, rng)
    rolls, total = list(first.rolls), first.total
    if crit:
        again = roll(formula, rng)
        extra = sum(again.rolls)          # dice only, modifier not doubled
        rolls += again.rolls
        total += extra
    return {"formula": formula, "rolls": rolls, "modifier": first.modifier,
            "total": total, "label": f"{sheet['attack']['name']} damage"}


def resolve_roll_request(sheet: dict, req: dict, npcs: dict, rng) -> dict:
    kind = req.get("kind", "check")
    if kind == "attack":
        target = req.get("target") or ""
        ac = npcs.get(target, {}).get("ac", 12)
        res = attack_roll(sheet, ac, rng)
        if res["hit"]:
            dmg = damage_roll(sheet, res["crit"], rng)
            res["outcome"] = f"crit! {dmg['total']} damage" if res["crit"] else f"hit for {dmg['total']}"
        else:
            res["outcome"] = "miss"
        return res
    skill = req.get("skill")
    ability = req.get("ability") or (SKILL_ABILITY.get(skill or "", "") if skill else "")
    if not ability:
        raise RulesError(f"cannot infer ability for {req!r}")
    res = ability_check(sheet, ability, skill, rng)
    res["outcome"] = str(res["total"])
    return res
