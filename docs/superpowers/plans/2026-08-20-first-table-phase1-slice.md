# First Table — Phase 1 "The Slice" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A working vertical slice of First Table: a phone-shaped chat app where the user DMs "The Goblin Toll" for three persistent AI player agents (Marcus, Pix, Wren), with a cold open, turn-managed group-chat responses, a server-side dice/rules service, a private DM Screen drawer, and a telemetry-only report card (spotlight + pacing) after each scene.

**Architecture:** Expo (React Native, TypeScript) client talking to a FastAPI (Python 3.12) backend over REST + one WebSocket per campaign. Backend pipeline per DM input: Interpreter (LLM, heuristic fallback) → Turn Manager (pure code) → Agent Runner (LLM per selected agent) → Rules/Dice service (pure code, seeded) → Director (pure code: beats, whispers, clocks) → Telemetry. SQLite persistence. LLM access behind a provider abstraction: `mock` (deterministic, for tests/offline), `ollama` (local dev, qwen3.5:9b — installed on this machine), `anthropic` (claude-haiku-4-5 per spec §10 model tiering).

**Tech Stack:** Python 3.12, FastAPI, uvicorn, httpx, anthropic SDK, sqlite3 (stdlib), pytest · Node 24, Expo (blank TypeScript template), react-native-web for browser verification. No vector DB, no SQLAlchemy, no react-navigation (state-machine screens).

**Spec:** `FIRST_TABLE_design_spec.md` (repo root). This plan implements §14 Phase 1 only.

## Global Constraints

- Phase 1 cuts (spec §14): **no** TTS, push notifications, XP/leveling, Layer-2 social learning, Brannek (seat 4), LLM judge, contradiction detector, initiative rail. Do not build them.
- **Dice are sacred** (spec §6): all randomness comes from the seeded server-side dice service. The LLM never rolls, never does math. Agents may only *request* rolls.
- **Cold open** (spec §3): every scene opens with the party already talking. The DM's first act is reacting. First scene's cold open is scripted content, delivered before any DM input is possible.
- **Latency masking** (spec §3): server emits `typing` frames immediately after DM input, interjectors (short one-liners) stream before the main responder.
- **IP hygiene** (spec §12): never emit the strings "Dungeons & Dragons", "D&D", "beholder", "mind flayer", "Strahd", or any Forgotten Realms name in code, content, or UI copy. Marketing copy says "5E-compatible". Ship an SRD 5.1 CC-BY-4.0 attribution string in the app (Home screen footer) and `server/firsttable/content/ATTRIBUTION.md`.
- Personas and all content PG-13 by construction (spec §12).
- Working name: **First Table**. Python package: `firsttable`. Expo app dir: `app/`. Server dir: `server/`.
- Env config (all optional): `FIRSTTABLE_PROVIDER` = `mock` (default) | `ollama` | `anthropic`; `FIRSTTABLE_OLLAMA_MODEL` (default `qwen3.5:9b`); `FIRSTTABLE_OLLAMA_URL` (default `http://localhost:11434`); `FIRSTTABLE_ANTHROPIC_MODEL` (default `claude-haiku-4-5`); `FIRSTTABLE_DB` (default `firsttable.db`, `:memory:` allowed); `FIRSTTABLE_SEED` (int; unset = nondeterministic).
- Tests must pass with the `mock` provider and no network. `pytest` runs from `server/`.
- Windows host: commands below are PowerShell-safe; paths use the repo root `C:\Users\whate\Documents\AI Locally\superdungeons`.
- Every commit message ends with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

---

## Locked protocol (all tasks conform to this — do not drift)

### REST (FastAPI, port 8000, CORS `*`)

| Method & path | Body | Returns |
|---|---|---|
| `POST /api/campaigns` | `{"name": str?}` | `CampaignState` |
| `GET /api/campaigns` | — | `[{"id": int, "name": str, "created_at": str}]` |
| `GET /api/campaigns/{cid}` | — | `CampaignState` |
| `POST /api/campaigns/{cid}/scenes` | `{}` | `{"scene_id": int}` (cold open then flows over WS) |
| `POST /api/campaigns/{cid}/scenes/end` | `{}` | `{"report": Report}` |

### WebSocket `/ws/{cid}`

Client→server JSON frames:
- `{"type": "dm_input", "text": str, "mode": "voice"|"text"}`
- `{"type": "roll", "formula": str, "label": str}`  (manual dice-tray roll)

Server→client JSON frames:
- `{"type": "hello", "campaign": CampaignState}`
- `{"type": "message", "message": ThreadMessage}`
- `{"type": "typing", "seat": str, "name": str}` / `{"type": "typing_stop", "seat": str}`
- `{"type": "dm_screen", "dm_screen": DMScreenState}`
- `{"type": "scene", "status": "started"|"ended", "scene_id": int, "report": Report|null}`
- `{"type": "error", "detail": str}`

### Shared shapes (pydantic on server — `firsttable/protocol.py`; TS mirror — `app/src/types.ts`)

```
ThreadMessage = { id: int, ts: float, kind: "dm"|"agent"|"system"|"roll",
                  seat: str|null, name: str|null,
                  speech: str|null, action: str|null, ooc: str|null,
                  text: str|null,
                  roll: RollResultView|null }
RollResultView = { formula: str, rolls: int[], modifier: int, total: int,
                   label: str, actor: str, outcome: str|null }
PartyMember  = { seat: str, name: str, char_class: str, ancestry: str, level: int,
                 hp: int, max_hp: int, ac: int, mood: str, portrait: str,
                 stats: {str: int} }
BeatView     = { id: str, title: str, status: "locked"|"active"|"done",
                 dm_notes: str, secrets: str[] }
ClockView    = { name: str, segments: int, filled: int }
NpcView      = { name: str, voice_note: str, secret: str, status: str }
DMScreenState= { spine_title: str, beats: BeatView[], clocks: ClockView[],
                 npcs: NpcView[], party_status: {seat,name,hp,max_hp,conditions:str[]}[] }
Report       = { scene_id: int,
                 axes: { spotlight: {score:int, detail:str},
                         pacing:    {score:int, detail:str} },
                 drill_suggestion: str, notes: str[] }
CampaignState= { id: int, name: str, scene_active: bool, scene_id: int|null,
                 party: PartyMember[], thread: ThreadMessage[],
                 dm_screen: DMScreenState }
```

Seats are the strings `"seat1"` (Marcus), `"seat2"` (Pix), `"seat3"` (Wren).

### Internal interfaces (backend)

```
dice.roll(formula: str, rng: random.Random) -> RollResult(formula, rolls, modifier, total)
rules.ability_check(sheet: dict, ability: str, skill: str|None, rng) -> CheckResult
rules.attack_roll(sheet: dict, target_ac: int, rng) -> AttackResult
rules.resolve_roll_request(sheet, req: dict, npcs: dict, rng) -> RollResultView-shaped dict
llm.get_provider(cfg) -> LLMProvider     # .complete_json(system, messages, schema) -> dict (async)
interpreter.interpret(provider, text, party, recent) -> Interpretation
   Interpretation = { intent: "narration"|"npc_dialogue"|"question_to_party"|"ruling"|
                              "ooc"|"combat_action"|"group_check",
                      addressed_seats: [str], entities: [str],
                      scene_tags: [str], skill: str|null }
   scene_tag vocabulary (closed): ["toll_paid","lie_exposed","combat_start",
                                   "mercy_shown","party_crosses","stall"]
turn_manager.plan(interp, agents, spotlight, rng) -> TurnPlan(main, interjectors, hesitation)
agent_runner.run_agent(provider, persona, sheet, mode, context) -> AgentReply
   AgentReply = { speech: str, action: str, ooc: str,
                  roll_request: {kind:"check"|"attack", ability:str?, skill:str?,
                                 target:str?}|null }
director.on_dm_turn(state, interp) -> DirectorEvents(whispers_fired, beat_changed, clock_ticks)
telemetry.SceneTelemetry: .record_dm(ts), .record_agent(seat, ts), .record_hesitation(seat, ts),
                          .record_hesitation_answered(seat)
report_card.build(tel: SceneTelemetry, personas, scene_minutes_budget) -> Report dict
```

---

## Execution order

Two independent chains after Task 1; run them in parallel:
- **Backend chain:** Task 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11 → 12
- **Frontend chain:** Task 1 → 13 → 14 → 15
- **Integration:** Task 16 (needs both chains)

---

### Task 1: Repo scaffold

**Files:**
- Create: `.gitignore`, `server/requirements.txt`, `server/pytest.ini`, `server/firsttable/__init__.py`, `server/firsttable/config.py`, `server/tests/__init__.py`, `server/tests/test_config.py`

**Interfaces:**
- Produces: `firsttable.config.Config` dataclass + `load_config() -> Config` used by every backend task.

- [ ] **Step 1: git init + .gitignore**

```bash
cd "C:/Users/whate/Documents/AI Locally/superdungeons" && git init -b main
```

`.gitignore`:
```
__pycache__/
*.pyc
.venv/
venv/
node_modules/
.expo/
dist/
*.db
.env
```

- [ ] **Step 2: server skeleton**

`server/requirements.txt`:
```
fastapi>=0.115
uvicorn[standard]>=0.30
httpx>=0.27
anthropic>=0.40
pytest>=8
```

`server/pytest.ini`:
```ini
[pytest]
testpaths = tests
```

`server/firsttable/config.py`:
```python
import os
from dataclasses import dataclass


@dataclass
class Config:
    provider: str = "mock"          # mock | ollama | anthropic
    ollama_model: str = "qwen3.5:9b"
    ollama_url: str = "http://localhost:11434"
    anthropic_model: str = "claude-haiku-4-5"
    db_path: str = "firsttable.db"
    seed: int | None = None


def load_config() -> Config:
    seed = os.environ.get("FIRSTTABLE_SEED")
    return Config(
        provider=os.environ.get("FIRSTTABLE_PROVIDER", "mock"),
        ollama_model=os.environ.get("FIRSTTABLE_OLLAMA_MODEL", "qwen3.5:9b"),
        ollama_url=os.environ.get("FIRSTTABLE_OLLAMA_URL", "http://localhost:11434"),
        anthropic_model=os.environ.get("FIRSTTABLE_ANTHROPIC_MODEL", "claude-haiku-4-5"),
        db_path=os.environ.get("FIRSTTABLE_DB", "firsttable.db"),
        seed=int(seed) if seed else None,
    )
```

`server/tests/test_config.py`:
```python
from firsttable.config import load_config


def test_defaults(monkeypatch):
    for k in list(__import__("os").environ):
        if k.startswith("FIRSTTABLE_"):
            monkeypatch.delenv(k)
    cfg = load_config()
    assert cfg.provider == "mock"
    assert cfg.anthropic_model == "claude-haiku-4-5"
    assert cfg.seed is None


def test_env_override(monkeypatch):
    monkeypatch.setenv("FIRSTTABLE_PROVIDER", "ollama")
    monkeypatch.setenv("FIRSTTABLE_SEED", "42")
    cfg = load_config()
    assert cfg.provider == "ollama"
    assert cfg.seed == 42
```

- [ ] **Step 3: venv + install + run tests**

```bash
cd server && python -m venv .venv && .venv/Scripts/python -m pip install -r requirements.txt && .venv/Scripts/python -m pytest -q
```
Expected: 2 passed. (All later `pytest` invocations mean `server/.venv/Scripts/python -m pytest`.)

- [ ] **Step 4: Commit** `chore: scaffold server package and config`

---

### Task 2: Dice service

**Files:**
- Create: `server/firsttable/dice.py`
- Test: `server/tests/test_dice.py`

**Interfaces:**
- Produces: `RollResult` dataclass `(formula: str, rolls: list[int], modifier: int, total: int)`; `roll(formula: str, rng: random.Random) -> RollResult`; `DiceError(ValueError)`.
- Formula grammar: `NdS(+|-M)?` and bare `dS`, e.g. `d20`, `2d6+3`, `1d8-1`. N∈[1,20], S∈{4,6,8,10,12,20,100}.

- [ ] **Step 1: failing tests**

```python
import random
import pytest
from firsttable.dice import roll, DiceError


def rng():
    return random.Random(7)


def test_d20_in_range():
    r = roll("d20", rng())
    assert len(r.rolls) == 1 and 1 <= r.rolls[0] <= 20
    assert r.total == r.rolls[0] and r.modifier == 0


def test_seeded_determinism():
    assert roll("2d6+3", random.Random(99)).total == roll("2d6+3", random.Random(99)).total


def test_modifier_math():
    r = roll("2d6+3", rng())
    assert r.total == sum(r.rolls) + 3 and r.modifier == 3


def test_negative_modifier():
    r = roll("1d8-1", rng())
    assert r.total == sum(r.rolls) - 1


@pytest.mark.parametrize("bad", ["", "d7", "0d6", "21d6", "2d6+", "banana", "1d6+abc"])
def test_rejects_garbage(bad):
    with pytest.raises(DiceError):
        roll(bad, rng())
```

- [ ] **Step 2: run** `pytest tests/test_dice.py -q` → FAIL (module missing)

- [ ] **Step 3: implement**

```python
import random
import re
from dataclasses import dataclass

_SIDES = {4, 6, 8, 10, 12, 20, 100}
_RE = re.compile(r"^(\d*)d(\d+)([+-]\d+)?$")


class DiceError(ValueError):
    pass


@dataclass
class RollResult:
    formula: str
    rolls: list[int]
    modifier: int
    total: int


def roll(formula: str, rng: random.Random) -> RollResult:
    m = _RE.match(formula.strip().lower().replace(" ", ""))
    if not m:
        raise DiceError(f"bad formula: {formula!r}")
    n = int(m.group(1) or 1)
    sides = int(m.group(2))
    mod = int(m.group(3) or 0)
    if not (1 <= n <= 20) or sides not in _SIDES:
        raise DiceError(f"bad formula: {formula!r}")
    rolls = [rng.randint(1, sides) for _ in range(n)]
    return RollResult(formula=formula.strip(), rolls=rolls, modifier=mod, total=sum(rolls) + mod)
```

- [ ] **Step 4: run** → PASS
- [ ] **Step 5: Commit** `feat: seeded dice service`

---

### Task 3: Rules service

**Files:**
- Create: `server/firsttable/rules.py`
- Test: `server/tests/test_rules.py`

**Interfaces:**
- Consumes: `dice.roll`.
- Produces:
  - `ability_mod(score: int) -> int` — SRD formula `(score-10)//2`.
  - `SKILL_ABILITY: dict[str, str]` — at minimum: perception→wis, stealth→dex, persuasion→cha, deception→cha, insight→wis, investigation→int, athletics→str, arcana→int, sleight_of_hand→dex, intimidation→cha, religion→int, survival→wis.
  - `ability_check(sheet: dict, ability: str, skill: str|None, rng) -> dict` with keys `formula, rolls, modifier, total, label, proficient(bool)`. Modifier = ability mod + proficiency bonus (2 at level 1) if `skill in sheet["proficiencies"]` or `ability in sheet.get("save_proficiencies", [])` is NOT used here (checks only). Unknown ability → raise `rules.RulesError`.
  - `attack_roll(sheet: dict, target_ac: int, rng) -> dict` with keys `formula, rolls, modifier, total, hit(bool), crit(bool), label`. Uses `sheet["attack"]["ability"]` mod + proficiency 2; crit on natural 20 (hit regardless), natural 1 always misses.
  - `damage_roll(sheet: dict, crit: bool, rng) -> dict` — rolls `sheet["attack"]["damage"]` (e.g. `"1d8+1"`), doubling the dice (not modifier) on crit: roll the dice part twice.
  - `resolve_roll_request(sheet, req, npcs, rng) -> dict` — dispatch: `kind=="check"` → ability_check (default ability from skill map when only skill given); `kind=="attack"` → attack vs `npcs[req["target"]]["ac"]` (default AC 12 if target unknown) then damage if hit, returning merged dict with `outcome` string like `"hit for 5"` / `"miss"` / `"crit! 9 damage"` / check → `outcome=str(total)`.
- Sheet dict shape (produced by Task 4 content): `{"stats": {"str":8,...}, "proficiencies": ["arcana",...], "level": 1, "ac": 12, "hp": 8, "max_hp": 8, "attack": {"name": "Dagger", "ability": "dex", "damage": "1d4+2"}}`.

- [ ] **Step 1: failing tests**

```python
import random
import pytest
from firsttable import rules

SHEET = {
    "stats": {"str": 8, "dex": 14, "con": 14, "int": 16, "wis": 12, "cha": 10},
    "proficiencies": ["arcana", "investigation"],
    "level": 1, "ac": 12, "hp": 8, "max_hp": 8,
    "attack": {"name": "Dagger", "ability": "dex", "damage": "1d4+2"},
}


def test_ability_mod():
    assert rules.ability_mod(8) == -1
    assert rules.ability_mod(10) == 0
    assert rules.ability_mod(16) == 3
    assert rules.ability_mod(15) == 2


def test_check_unproficient():
    r = rules.ability_check(SHEET, "wis", "perception", random.Random(1))
    assert r["modifier"] == 1 and r["proficient"] is False
    assert r["total"] == r["rolls"][0] + 1


def test_check_proficient():
    r = rules.ability_check(SHEET, "int", "arcana", random.Random(1))
    assert r["modifier"] == 3 + 2 and r["proficient"] is True


def test_check_skill_only_infers_ability():
    r = rules.resolve_roll_request(SHEET, {"kind": "check", "skill": "perception"}, {}, random.Random(1))
    assert "outcome" in r and r["modifier"] == 1


def test_unknown_ability_raises():
    with pytest.raises(rules.RulesError):
        rules.ability_check(SHEET, "luck", None, random.Random(1))


def test_attack_crit_on_nat20():
    class Fixed:
        def randint(self, a, b):
            return 20
    r = rules.attack_roll(SHEET, target_ac=30, rng=Fixed())
    assert r["crit"] is True and r["hit"] is True


def test_attack_nat1_misses():
    class Fixed:
        def randint(self, a, b):
            return 1
    r = rules.attack_roll(SHEET, target_ac=2, rng=Fixed())
    assert r["hit"] is False


def test_resolve_attack_vs_npc():
    r = rules.resolve_roll_request(SHEET, {"kind": "attack", "target": "Grubb Marsh"},
                                   {"Grubb Marsh": {"ac": 13, "hp": 11}}, random.Random(3))
    assert r["outcome"].startswith(("hit", "miss", "crit"))
```

- [ ] **Step 2: run** → FAIL
- [ ] **Step 3: implement** (pure code; damage-on-crit: parse formula with `dice._RE`-style regex, roll dice twice, add modifier once; build `label` like `"Perception check"` / `"Dagger attack"`)

```python
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
```

- [ ] **Step 4: run** → PASS
- [ ] **Step 5: Commit** `feat: SRD checks and basic combat math`

---

### Task 4: Content — personas, sheets, "The Goblin Toll" spine

**Files:**
- Create: `server/firsttable/content/personas.json`, `server/firsttable/content/goblin_toll.json`, `server/firsttable/content/ATTRIBUTION.md`, `server/firsttable/personas.py`, `server/firsttable/spine.py`
- Test: `server/tests/test_content.py`

**Interfaces:**
- Produces: `personas.load_personas() -> dict[str, Persona]` keyed by seat. `Persona` dataclass: `seat, name, char_class, ancestry, portrait, voice_style, personality (dict: chaos, pedantry, spotlight_seek, risk), agendas (dict: public_goal, private_secret, session_want), sheet (dict, Task-3 shape), system_prompt() -> str`.
- Produces: `spine.load_spine() -> Spine`; `Spine` dataclass: `id, title, cold_open: list[dict], beats: list[Beat], npcs: dict[name -> {voice_note, secret, status, ac, hp}], clocks: list[{name, segments, tick_on_scene_end: bool}]`. `Beat`: `id, title, dm_notes, secrets: list[str], pressure_budget_minutes: int, whispers: list[{seat, text, trigger: {"type": "tag"|"turn_count", "value": str|int}}], advance_when: list[str]` (scene_tags any-of).

- [ ] **Step 1: failing tests**

```python
from firsttable.personas import load_personas
from firsttable.spine import load_spine


def test_three_seats():
    p = load_personas()
    assert set(p) == {"seat1", "seat2", "seat3"}
    assert p["seat1"].name == "Marcus Veyle"
    assert p["seat2"].personality["chaos"] > 0.7
    assert p["seat3"].personality["spotlight_seek"] < 0


def test_sheets_are_rules_compatible():
    from firsttable import rules
    import random
    for persona in load_personas().values():
        r = rules.ability_check(persona.sheet, "wis", "perception", random.Random(1))
        assert "total" in r
        rules.attack_roll(persona.sheet, 12, random.Random(1))


def test_system_prompt_mentions_identity():
    p = load_personas()["seat2"]
    sp = p.system_prompt()
    assert "Pix" in sp and "JSON" in sp


def test_spine_shape():
    s = load_spine()
    assert s.title == "The Goblin Toll"
    assert len(s.beats) == 2
    assert s.beats[0].id == "beat1" and s.beats[1].id == "beat2"
    assert len(s.cold_open) >= 3
    assert "Grubb Marsh" in s.npcs
    assert s.clocks[0]["segments"] == 4
    assert any(w["seat"] == "seat2" for w in s.beats[0].whispers)


def test_no_wotc_product_identity():
    import json, pathlib
    root = pathlib.Path(__file__).parent.parent / "firsttable" / "content"
    blob = " ".join(p.read_text(encoding="utf-8") for p in root.glob("*.json")).lower()
    for banned in ["dungeons & dragons", "d&d", "beholder", "mind flayer", "strahd", "faerun", "forgotten realms"]:
        assert banned not in blob
```

- [ ] **Step 2: run** → FAIL

- [ ] **Step 3: write content data**

`server/firsttable/content/personas.json` (exact content):
```json
{
  "seat1": {
    "name": "Marcus Veyle",
    "char_class": "Wizard",
    "ancestry": "Human",
    "portrait": "🧙",
    "voice_style": "Precise, dry, slightly exasperated. Quotes rules from memory. Says 'technically' a lot.",
    "personality": {"chaos": 0.15, "pedantry": 0.9, "spotlight_seek": 0.4, "risk": 0.3},
    "agendas": {
      "public_goal": "Reach Ironhold before the mountain thaw closes the passes.",
      "private_secret": "He failed his Academy certification twice and is terrified of being seen as an amateur.",
      "session_want": "Prove his rules knowledge is indispensable."
    },
    "sheet": {
      "stats": {"str": 8, "dex": 14, "con": 14, "int": 16, "wis": 12, "cha": 10},
      "proficiencies": ["arcana", "investigation", "insight"],
      "level": 1, "ac": 12, "hp": 8, "max_hp": 8,
      "attack": {"name": "Fire Bolt", "ability": "int", "damage": "1d10+0"}
    }
  },
  "seat2": {
    "name": "Pix",
    "char_class": "Rogue",
    "ancestry": "Goblin",
    "portrait": "😈",
    "voice_style": "Rapid, gleeful, zero impulse control. Short sentences. Refers to self in third person when excited.",
    "personality": {"chaos": 0.85, "pedantry": 0.05, "spotlight_seek": 0.8, "risk": 0.9},
    "agendas": {
      "public_goal": "See the world, steal a little of it.",
      "private_secret": "Fleeing a debt to the Copper Knuckle syndicate; their marks make Pix twitchy.",
      "session_want": "Acquire one (1) shiny thing without asking."
    },
    "sheet": {
      "stats": {"str": 8, "dex": 16, "con": 12, "int": 10, "wis": 12, "cha": 13},
      "proficiencies": ["stealth", "sleight_of_hand", "deception", "perception"],
      "level": 1, "ac": 14, "hp": 9, "max_hp": 9,
      "attack": {"name": "Dagger", "ability": "dex", "damage": "1d4+3"}
    }
  },
  "seat3": {
    "name": "Wren",
    "char_class": "Cleric",
    "ancestry": "Half-elf",
    "portrait": "🕊️",
    "voice_style": "Soft, hesitant, trails off. Speaks up only when it matters morally, then is startlingly firm.",
    "personality": {"chaos": 0.1, "pedantry": 0.1, "spotlight_seek": -0.7, "risk": 0.2},
    "agendas": {
      "public_goal": "Carry her grandmother's censer to the shrine at Ironhold.",
      "private_secret": "She hears her god most clearly when she is afraid, and she is afraid of that.",
      "session_want": "Go one day without being a burden."
    },
    "sheet": {
      "stats": {"str": 10, "dex": 12, "con": 13, "int": 11, "wis": 16, "cha": 13},
      "proficiencies": ["insight", "religion", "persuasion"],
      "level": 1, "ac": 16, "hp": 9, "max_hp": 9,
      "attack": {"name": "Mace", "ability": "str", "damage": "1d6+0"}
    }
  }
}
```

`server/firsttable/content/goblin_toll.json` (exact content):
```json
{
  "id": "goblin_toll",
  "title": "The Goblin Toll",
  "cold_open": [
    {"seat": "seat2", "speech": "Toll bridge! Pix has never paid a toll in Pix's LIFE and today is not the day we start.", "action": "bounces on the balls of her feet, eyeing the rope railings"},
    {"seat": "seat1", "speech": "It is one silver, Pix. The alternative is a forty-minute detour through a bog. Technically the bog also charges a toll; it's called leeches.", "action": "adjusts his satchel and squints at the toll sign"},
    {"seat": "seat3", "speech": "I... I can pay it. If that helps. I have some coin left.", "action": "half-raises her hand, then lowers it"},
    {"seat": "seat2", "speech": "Okay okay okay — where were we. We're at the toll bridge, right? Big ugly guy at the gate?", "ooc": "Finally, you're here. What do we see, boss?"}
  ],
  "npcs": {
    "Grubb Marsh": {
      "voice_note": "Gravel voice, fake-official. Clears his throat before every lie.",
      "secret": "Not the Baron's toll-keeper. He works for the Redtooth band camped in the old quarry lair. The 'writ' he waves is a stolen laundry receipt.",
      "status": "at the bridge gate",
      "ac": 13, "hp": 11
    },
    "Nib": {
      "voice_note": "Small goblin holding the toll rope. Doesn't talk. Flinches at loud noises.",
      "secret": "Half-starved conscript. Will bolt (and talk) if shown one act of kindness.",
      "status": "holding the rope",
      "ac": 12, "hp": 4
    }
  },
  "clocks": [
    {"name": "The Redtooth Muster", "segments": 4, "tick_on_scene_end": true}
  ],
  "beats": [
    {
      "id": "beat1",
      "title": "The Toll",
      "dm_notes": "A rope-and-plank bridge over the Millrun gorge. Grubb Marsh demands one silver a head, 'by order of the Baron'. He is lying. Let the party smell it.",
      "secrets": [
        "The toll sign is fresh paint over an older warning sign.",
        "Grubb's 'writ' is a laundry receipt — anyone who reads it sees through him.",
        "A merchant cart is due behind the party; Grubb gets greedy and doubles the toll."
      ],
      "pressure_budget_minutes": 8,
      "whispers": [
        {"seat": "seat2", "text": "That paint on the toll sign — same crude red slashes as the marks near the old quarry. This is NOT the Baron's toll. Press him.", "trigger": {"type": "turn_count", "value": 2}},
        {"seat": "seat1", "text": "Baronial law: a legal toll requires a stamped writ, displayed on demand. Ask to see it.", "trigger": {"type": "turn_count", "value": 3}}
      ],
      "advance_when": ["toll_paid", "lie_exposed", "combat_start", "party_crosses"]
    },
    {
      "id": "beat2",
      "title": "The Truth on the Bridge",
      "dm_notes": "The lie cracks or coin changes hands. If exposed, Grubb blusters, then whistles for two goblin skirmishers under the bridge. Nib wants out. Fail-forward: if the party is beaten, they wake robbed at the quarry mouth (Phase 2 hook).",
      "secrets": [
        "Two goblin skirmishers (AC 13, HP 7 each) cling under the bridge deck.",
        "Nib will defect at the first act of mercy and point to the quarry lair.",
        "The toll box holds 34 silver and a brass Redtooth signet — evidence."
      ],
      "pressure_budget_minutes": 10,
      "whispers": [
        {"seat": "seat3", "text": "The small goblin on the rope is half-starved and terrified. You feel a nudge, like a hand on your shoulder: mercy, here, matters.", "trigger": {"type": "tag", "value": "combat_start"}},
        {"seat": "seat2", "text": "The toll box. Unattended when things get loud. It is CALLING you.", "trigger": {"type": "tag", "value": "combat_start"}}
      ],
      "advance_when": []
    }
  ]
}
```

`server/firsttable/content/ATTRIBUTION.md`:
```markdown
This work includes material taken from the System Reference Document 5.1 ("SRD 5.1")
by Wizards of the Coast LLC and available at
https://dnd.wizards.com/resources/systems-reference-document.
The SRD 5.1 is licensed under the Creative Commons Attribution 4.0 International
License available at https://creativecommons.org/licenses/by/4.0/legalcode.
All scenario content, characters, and names in First Table are original.
```

- [ ] **Step 4: implement loaders**

`server/firsttable/personas.py`:
```python
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
            f"CHARACTER at a 5E-compatible tabletop game. A human Dungeon Master runs the world; "
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
            "HARD RULES:\n"
            "- Stay in character. PG-13 always.\n"
            "- NEVER narrate the world, other characters, or NPC decisions — that is the DM's job.\n"
            "- NEVER roll dice or state roll results. To attempt something uncertain, set roll_request.\n"
            "- Keep speech under 60 words. Interjections under 20 words.\n"
            "- Output ONLY JSON: {\"speech\": str, \"action\": str, \"ooc\": str, "
            "\"roll_request\": null | {\"kind\": \"check\"|\"attack\", \"ability\"?: str, "
            "\"skill\"?: str, \"target\"?: str}}.\n"
            "speech = words said aloud in character. action = short third-person physical action. "
            "ooc = out-of-character table talk (usually empty). Use roll_request sparingly."
        )


def load_personas() -> dict[str, Persona]:
    data = json.loads((_CONTENT / "personas.json").read_text(encoding="utf-8"))
    return {seat: Persona(seat=seat, **fields) for seat, fields in data.items()}
```

`server/firsttable/spine.py`:
```python
import json
import pathlib
from dataclasses import dataclass, field

_CONTENT = pathlib.Path(__file__).parent / "content"


@dataclass
class Beat:
    id: str
    title: str
    dm_notes: str
    secrets: list[str]
    pressure_budget_minutes: int
    whispers: list[dict]
    advance_when: list[str]


@dataclass
class Spine:
    id: str
    title: str
    cold_open: list[dict]
    beats: list[Beat]
    npcs: dict
    clocks: list[dict] = field(default_factory=list)


def load_spine(spine_id: str = "goblin_toll") -> Spine:
    data = json.loads((_CONTENT / f"{spine_id}.json").read_text(encoding="utf-8"))
    return Spine(
        id=data["id"], title=data["title"], cold_open=data["cold_open"],
        beats=[Beat(**b) for b in data["beats"]], npcs=data["npcs"], clocks=data["clocks"],
    )
```

- [ ] **Step 5: run** `pytest tests/test_content.py -q` → PASS
- [ ] **Step 6: Commit** `feat: personas, sheets, and The Goblin Toll spine`

---

### Task 5: DB layer

**Files:**
- Create: `server/firsttable/db.py`
- Test: `server/tests/test_db.py`

**Interfaces:**
- Produces: `class Store` wrapping sqlite3 (`check_same_thread=False`, `row_factory=sqlite3.Row`), created via `Store(path)`; `store.close()`.
  - `create_campaign(name: str, spine_id: str) -> int`
  - `list_campaigns() -> list[dict]` (id, name, created_at)
  - `get_campaign(cid) -> dict|None` (id, name, spine_id, state_json → parsed `state` dict)
  - `save_state(cid, state: dict)` — the whole mutable campaign state (beat index, clock fill, whisper log, moods, npc hp) as one JSON column; simple by design at slice scope.
  - `start_scene(cid, beat_id: str) -> int`; `end_scene(scene_id, report: dict)`
  - `active_scene(cid) -> dict|None` (id, beat_id, started)
  - `append_message(cid, scene_id, msg: dict) -> int` — assigns message id; stores JSON.
  - `thread(cid, limit=200) -> list[dict]` — messages in order, each with its id merged in.
  - `append_ledger(cid, scene_id, actor: str, type: str, content: str, entity_tags: list[str])`
- Schema (from spec §11, slice subset): tables `campaign(id, name, spine_id, state_json, created_at)`, `scene(id, campaign_id, beat_id, started, ended, report_json)`, `message(id, campaign_id, scene_id, ts, payload_json)`, `ledger(id, campaign_id, scene_id, ts, actor, type, content, entity_tags)`.

- [ ] **Step 1: failing tests**

```python
from firsttable.db import Store


def make():
    return Store(":memory:")


def test_campaign_roundtrip():
    s = make()
    cid = s.create_campaign("Test", "goblin_toll")
    got = s.get_campaign(cid)
    assert got["name"] == "Test" and got["spine_id"] == "goblin_toll"
    assert got["state"] == {}
    s.save_state(cid, {"beat_index": 1})
    assert s.get_campaign(cid)["state"]["beat_index"] == 1
    assert s.list_campaigns()[0]["id"] == cid


def test_scene_lifecycle():
    s = make()
    cid = s.create_campaign("T", "goblin_toll")
    assert s.active_scene(cid) is None
    sid = s.start_scene(cid, "beat1")
    assert s.active_scene(cid)["beat_id"] == "beat1"
    s.end_scene(sid, {"axes": {}})
    assert s.active_scene(cid) is None


def test_thread_ordering_and_ids():
    s = make()
    cid = s.create_campaign("T", "goblin_toll")
    sid = s.start_scene(cid, "beat1")
    a = s.append_message(cid, sid, {"kind": "dm", "text": "hello"})
    b = s.append_message(cid, sid, {"kind": "agent", "speech": "hi"})
    t = s.thread(cid)
    assert [m["id"] for m in t] == [a, b]
    assert t[0]["text"] == "hello"


def test_ledger_append():
    s = make()
    cid = s.create_campaign("T", "goblin_toll")
    sid = s.start_scene(cid, "beat1")
    s.append_ledger(cid, sid, "dm", "narration", "the bridge creaks", ["bridge"])
```

- [ ] **Step 2: run** → FAIL
- [ ] **Step 3: implement** — single file, `_init_schema()` executes `CREATE TABLE IF NOT EXISTS` statements; JSON via `json.dumps`/`loads`; timestamps `time.time()`; `end_scene` sets `ended`; `active_scene` selects `WHERE campaign_id=? AND ended IS NULL`. A `threading.Lock` around writes.
- [ ] **Step 4: run** → PASS
- [ ] **Step 5: Commit** `feat: sqlite store for campaigns, scenes, thread, ledger`

---

### Task 6: Turn Manager + spotlight state

**Files:**
- Create: `server/firsttable/turn_manager.py`
- Test: `server/tests/test_turn_manager.py`

**Interfaces:**
- Consumes: `Interpretation` dict (see locked interfaces), personas.
- Produces:
  - `class SpotlightState` — per-seat float debt. `.accrue(silent_seats: list[str])` adds 1.0 debt per silent seat per DM turn; `.clear(seat)` zeroes it; `.debt(seat) -> float`; `.to_dict()/.from_dict()` for persistence in campaign state.
  - `TurnPlan` dataclass: `main: str, interjectors: list[str], hesitation: str|None`.
  - `plan(interp: dict, personas: dict[str, Persona], spotlight: SpotlightState, rng: random.Random) -> TurnPlan`.
- Scoring (spec §6): `score(seat) = relevance * (0.5 + 0.5 * reactivity) * (1 + claimable_debt)` where
  - `relevance` = 1.0 if seat in `interp["addressed_seats"]`; 0.9 if `interp["intent"] == "ruling"` and pedantry > 0.6; 0.3 base.
  - `reactivity` = `max(chaos, pedantry, spotlight_seek clamped to [0,1])`.
  - `claimable_debt` = `debt * (1 + max(0, spotlight_seek))` — Wren's negative seek means she never *claims* debt.
- Rules: addressed seats always respond (main = highest-scoring addressed seat; other addressed seats become interjectors). Otherwise main = argmax score. Interjectors: up to 2 other seats where `rng.random() < 0.25 + 0.5 * chaos`, ordered by score. **Hesitation** (spec §6): if a seat with `spotlight_seek < 0` has `debt >= 3` and is not main/interjector, set `hesitation` to that seat. `plan` must be deterministic under a seeded rng.

- [ ] **Step 1: failing tests**

```python
import random
from firsttable.personas import load_personas
from firsttable.turn_manager import SpotlightState, plan


def interp(**kw):
    base = {"intent": "narration", "addressed_seats": [], "entities": [],
            "scene_tags": [], "skill": None}
    base.update(kw)
    return base


def test_addressed_seat_is_main():
    p = load_personas()
    t = plan(interp(addressed_seats=["seat3"]), p, SpotlightState(list(p)), random.Random(1))
    assert t.main == "seat3"


def test_ruling_pulls_the_rules_lawyer():
    p = load_personas()
    t = plan(interp(intent="ruling"), p, SpotlightState(list(p)), random.Random(1))
    assert t.main == "seat1"


def test_no_duplicate_speakers():
    p = load_personas()
    t = plan(interp(), p, SpotlightState(list(p)), random.Random(2))
    speakers = [t.main] + t.interjectors
    assert len(speakers) == len(set(speakers))


def test_hesitation_fires_for_silent_wren():
    p = load_personas()
    s = SpotlightState(list(p))
    for _ in range(4):
        s.accrue(["seat3"])          # Wren silent 4 turns
    t = plan(interp(addressed_seats=["seat1"]), p, s, random.Random(1))
    assert t.hesitation == "seat3" or t.main == "seat3"


def test_debt_clears_on_speaking():
    s = SpotlightState(["seat1", "seat2", "seat3"])
    s.accrue(["seat1"]); s.accrue(["seat1"])
    assert s.debt("seat1") == 2.0
    s.clear("seat1")
    assert s.debt("seat1") == 0.0


def test_deterministic_under_seed():
    p = load_personas()
    a = plan(interp(), p, SpotlightState(list(p)), random.Random(5))
    b = plan(interp(), p, SpotlightState(list(p)), random.Random(5))
    assert (a.main, a.interjectors) == (b.main, b.interjectors)
```

- [ ] **Step 2: run** → FAIL
- [ ] **Step 3: implement** per the scoring spec above (≈70 lines; `SpotlightState` holds `self._debt: dict[str, float]`).
- [ ] **Step 4: run** → PASS
- [ ] **Step 5: Commit** `feat: turn manager with spotlight debt and hesitation`

---

### Task 7: Telemetry + Report Card v1

**Files:**
- Create: `server/firsttable/telemetry.py`, `server/firsttable/report_card.py`
- Test: `server/tests/test_report_card.py`

**Interfaces:**
- Produces `telemetry.SceneTelemetry` dataclass-ish class with:
  - `.record_dm(ts: float)`, `.record_agent(seat: str, ts: float)`, `.record_hesitation(seat, ts)`, `.record_hesitation_answered(seat)`
  - fields: `dm_turns: list[float]`, `agent_turns: dict[seat, list[float]]`, `hesitations: list[tuple[seat, ts]]`, `hesitations_answered: list[seat]`, `started: float`, `.to_dict()/.from_dict()`.
- Produces `report_card.gini(values: list[float]) -> float` (0 when all equal or all zero) and `report_card.build(tel, personas, budget_minutes: int) -> dict` matching the locked `Report` shape minus `scene_id` (orchestrator adds it).
  - **Spotlight:** weighted turn counts `turns[seat] / (1 + 0.5 * spotlight_seek)` (so a shy player's turns count extra toward equality); `score = round(100 * (1 - gini(weighted)))`; +10 (cap 100) if every recorded hesitation seat appears in `hesitations_answered`; −15 (floor 0) if any seat has zero turns. `detail` names the most- and least-heard player.
  - **Pacing:** start at 100; −8 per dead-air gap (> 90 s between consecutive events, DM or agent); −15 if scene wall-clock exceeds `budget_minutes`; −20 if fewer than 3 DM turns; floor 0. `detail` states scene length and gap count.
  - **Drill suggestion:** lowest axis → spotlight: `"The Silent Player — run one scene where your grade is only how well you draw out the quiet seat."`; pacing: `"The Derail — practice cutting to the action: end every narration on a question or a change."` Tie → spotlight.
  - `notes`: list with one corner-coach sentence per axis (see spec §8 tone: coach, never schoolmarm).

- [ ] **Step 1: failing tests**

```python
from firsttable.personas import load_personas
from firsttable.telemetry import SceneTelemetry
from firsttable.report_card import build, gini


def tel_with(turns: dict[str, int], t0: float = 1000.0) -> SceneTelemetry:
    t = SceneTelemetry(started=t0)
    ts = t0
    for _ in range(4):
        ts += 10; t.record_dm(ts)
    for seat, n in turns.items():
        for _ in range(n):
            ts += 5; t.record_agent(seat, ts)
    return t


def test_gini_bounds():
    assert gini([1, 1, 1]) == 0
    assert gini([]) == 0
    assert 0.6 < gini([0, 0, 10]) <= 1


def test_balanced_table_scores_high():
    r = build(tel_with({"seat1": 3, "seat2": 3, "seat3": 3}), load_personas(), 15)
    assert r["axes"]["spotlight"]["score"] >= 85


def test_hogged_table_scores_low():
    r = build(tel_with({"seat1": 1, "seat2": 9, "seat3": 0}), load_personas(), 15)
    assert r["axes"]["spotlight"]["score"] < 60


def test_hesitation_answered_bonus():
    a = tel_with({"seat1": 3, "seat2": 3, "seat3": 2})
    b = tel_with({"seat1": 3, "seat2": 3, "seat3": 2})
    b.record_hesitation("seat3", 1050.0)
    b.record_hesitation_answered("seat3")
    ra, rb = build(a, load_personas(), 15), build(b, load_personas(), 15)
    assert rb["axes"]["spotlight"]["score"] >= ra["axes"]["spotlight"]["score"]


def test_dead_air_penalty():
    t = SceneTelemetry(started=0.0)
    t.record_dm(10.0); t.record_agent("seat1", 20.0)
    t.record_dm(200.0)          # 180s gap = dead air
    t.record_agent("seat2", 210.0); t.record_dm(220.0); t.record_dm(230.0)
    r = build(t, load_personas(), 15)
    assert r["axes"]["pacing"]["score"] <= 92


def test_drill_targets_lowest_axis():
    r = build(tel_with({"seat1": 1, "seat2": 9, "seat3": 0}), load_personas(), 15)
    assert "Silent Player" in r["drill_suggestion"]


def test_roundtrip_serialization():
    t = tel_with({"seat1": 2})
    t2 = SceneTelemetry.from_dict(t.to_dict())
    assert t2.agent_turns == t.agent_turns and t2.dm_turns == t.dm_turns
```

- [ ] **Step 2: run** → FAIL
- [ ] **Step 3: implement** both modules per the formulas above. `gini`: `sum(|xi-xj|) / (2 * n^2 * mean)` guarding zero mean/empty.
- [ ] **Step 4: run** → PASS
- [ ] **Step 5: Commit** `feat: scene telemetry and spotlight/pacing report card`

---

### Task 8: LLM provider layer

**Files:**
- Create: `server/firsttable/llm.py`
- Test: `server/tests/test_llm.py`

**Interfaces:**
- Consumes: `Config`.
- Produces:
  - `async LLMProvider.complete_json(system: str, messages: list[dict], schema: dict) -> dict` (abstract; messages are `{"role": "user"|"assistant", "content": str}`).
  - `get_provider(cfg: Config) -> LLMProvider` — maps `cfg.provider` to `MockProvider | OllamaProvider | AnthropicProvider`.
  - `extract_json(text: str) -> dict` — lenient: strips code fences, finds first `{`...matching `}`; raises `LLMError` on failure.
  - `LLMError(RuntimeError)`.
- **MockProvider** (deterministic, no network): inspects `schema["properties"]`. If it contains `"intent"` → return a heuristic interpretation of the last user message (reuse `interpreter.heuristic_interpret` — import inside the method to avoid a cycle). If it contains `"speech"` → return a canned in-character reply; detect persona by name in `system` ("Marcus" / "Pix" / "Wren"); cycle 3 canned lines per persona via an instance counter; Pix's second canned line must include `roll_request: {"kind": "check", "skill": "sleight_of_hand"}` (exercises the dice path in tests and offline demo); all others `roll_request: null`.
- **OllamaProvider**: `httpx.AsyncClient` POST `{url}/api/chat` body `{"model": cfg.ollama_model, "messages": [{"role": "system", "content": system}] + messages, "format": schema, "stream": False, "options": {"temperature": 0.8}}`; response JSON at `["message"]["content"]` → `extract_json`. 60 s timeout. Wrap transport errors in `LLMError`.
- **AnthropicProvider**: `anthropic.AsyncAnthropic()` (constructed lazily on first call), `client.messages.create(model=cfg.anthropic_model, max_tokens=1024, system=[{"type": "text", "text": system, "cache_control": {"type": "ephemeral"}}], messages=messages, output_config={"format": {"type": "json_schema", "schema": schema}})`; first text block → `json.loads`. Persona system blocks get prompt caching for free this way (spec §10). Wrap `anthropic.APIError` in `LLMError`.

- [ ] **Step 1: failing tests**

```python
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
```

- [ ] **Step 2: run** → FAIL
- [ ] **Step 3: implement** per interface block above.
- [ ] **Step 4: run** → PASS
- [ ] **Step 5: Commit** `feat: mock/ollama/anthropic provider layer`

---

### Task 9: Interpreter

**Files:**
- Create: `server/firsttable/interpreter.py`
- Test: `server/tests/test_interpreter.py`

**Interfaces:**
- Produces:
  - `INTERP_SCHEMA: dict` — JSON schema matching the locked `Interpretation` (enum intents, closed scene_tag enum, `additionalProperties: False`, all keys required).
  - `heuristic_interpret(text: str, party: dict[str, Persona]) -> dict` — pure code, no LLM: lowercase matching. Name mention → addressed seat ("marcus"→seat1, "pix"→seat2, "wren"→seat3, "everyone"/"you all"/"party" → all seats). `"roll"` + skill word → `group_check` when "everyone"/all addressed, else `question_to_party`, with `skill` set when a `rules.SKILL_ABILITY` key (space-tolerant) appears. Quoted text (`"` present) → `npc_dialogue`. Leading `(` or `ooc` → `ooc`. Contains "i rule"/"ruling"/"that works, but" → `ruling`. Contains "attack"/"initiative"/"roll for damage" → `combat_action` + tag `combat_start`. Contains "pay"/"paid the toll"/"hands over" with "toll"/"silver" → tag `toll_paid`. Contains "liar"/"fake"/"forged"/"laundry receipt"/"caught you" → tag `lie_exposed`. Contains "cross the bridge"/"across the bridge" → tag `party_crosses`. Contains "spare"/"mercy"/"let him go"/"feeds"/"kindness" → tag `mercy_shown`. Default intent `narration`.
  - `async interpret(provider, text: str, party, recent: list[str]) -> dict` — builds a classification system prompt (list party names/seats, the closed tag vocabulary with one-line definitions, "output JSON only"), calls `provider.complete_json(..., INTERP_SCHEMA)`, **validates** (intent in enum; unknown seats/tags dropped), and on `LLMError`/validation failure returns `heuristic_interpret(text, party)`. Always merges heuristic scene_tags into LLM output (union) — cheap insurance the director never misses a hard trigger.

- [ ] **Step 1: failing tests**

```python
import asyncio
from firsttable.personas import load_personas
from firsttable.interpreter import heuristic_interpret, interpret
from firsttable.llm import MockProvider, LLMError


def party():
    return load_personas()


def test_name_addressing():
    h = heuristic_interpret("Wren, the keeper looks at you. What do you do?", party())
    assert h["addressed_seats"] == ["seat3"]


def test_group_check():
    h = heuristic_interpret("Roll perception, everyone", party())
    assert h["intent"] == "group_check" and h["skill"] == "perception"
    assert set(h["addressed_seats"]) == {"seat1", "seat2", "seat3"}


def test_lie_exposed_tag():
    h = heuristic_interpret("Marcus snatches the writ - it's a laundry receipt. You caught him, he's a liar.", party())
    assert "lie_exposed" in h["scene_tags"]


def test_combat_tag():
    h = heuristic_interpret("Grubb snarls and draws steel. Roll initiative!", party())
    assert "combat_start" in h["scene_tags"]


def test_interpret_falls_back(monkeypatch):
    class Boom:
        async def complete_json(self, *a, **k):
            raise LLMError("down")
    out = asyncio.run(interpret(Boom(), "Pix, stop that.", party(), []))
    assert out["addressed_seats"] == ["seat2"]


def test_interpret_validates_and_merges(monkeypatch):
    class Weird:
        async def complete_json(self, *a, **k):
            return {"intent": "narration", "addressed_seats": ["seat9"],
                    "entities": [], "scene_tags": ["nonsense"], "skill": None}
    out = asyncio.run(interpret(Weird(), "They pay the toll in silver.", party(), []))
    assert out["addressed_seats"] == [] and "nonsense" not in out["scene_tags"]
    assert "toll_paid" in out["scene_tags"]
```

- [ ] **Step 2: run** → FAIL
- [ ] **Step 3: implement** per interface block.
- [ ] **Step 4: run** → PASS
- [ ] **Step 5: Commit** `feat: interpreter with LLM classification and heuristic fallback`

---

### Task 10: Agent runner

**Files:**
- Create: `server/firsttable/agent_runner.py`
- Test: `server/tests/test_agent_runner.py`

**Interfaces:**
- Produces:
  - `AGENT_SCHEMA: dict` — `{speech: string, action: string, ooc: string, roll_request: object|null}`, required all four, `additionalProperties: False`; `roll_request` sub-schema `{kind: enum[check, attack], ability?: string, skill?: string, target?: string}`.
  - `build_context(persona, thread_tail: list[dict], whisper: str|None, directive: str) -> list[dict]` — messages list: one user message containing (a) "RECENT TABLE:" + last ≤12 thread messages rendered as `Name: speech (action)` / `DM: text`, (b) optional `PRIVATE WHISPER (only you know this): ...`, (c) `DIRECTIVE: ...`.
  - Directives by mode: `main` → "Respond in character to the DM now."; `interject` → "One short interjection only — a single line, under 20 words."; `hesitate` → "You almost speak but hold back. One brief action only, no speech (or a trailing, unfinished half-sentence)."
  - `async run_agent(provider, persona, mode: str, thread_tail, whisper=None) -> dict` — calls `provider.complete_json(persona.system_prompt(), build_context(...), AGENT_SCHEMA)`; sanitizes: missing keys defaulted (`speech`/`action`/`ooc` → `""`), `roll_request` validated (bad kind → `None`); on `LLMError` returns a safe fallback `{speech: "", action: f"{persona.name} hesitates.", ooc: "", roll_request: None}` so the table never dies mid-scene.

- [ ] **Step 1: failing tests**

```python
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
```

- [ ] **Step 2: run** → FAIL
- [ ] **Step 3: implement** per interface block.
- [ ] **Step 4: run** → PASS
- [ ] **Step 5: Commit** `feat: agent runner with persona context and safe fallbacks`

---

### Task 11: Director

**Files:**
- Create: `server/firsttable/director.py`
- Test: `server/tests/test_director.py`

**Interfaces:**
- Consumes: `Spine`, campaign `state` dict (persisted via `Store.save_state`): `{"beat_index": int, "dm_turn_count": int, "fired_whispers": [str], "clock_fill": {name: int}, "npc_hp": {name: int}, "pending_whispers": {seat: [str]}}`.
- Produces:
  - `DirectorEvents` dataclass: `whispers_fired: list[dict] ({seat, text})`, `beat_changed: str|None` (new beat id), `clock_ticks: list[str]`.
  - `on_dm_turn(spine: Spine, state: dict, interp: dict) -> DirectorEvents` — mutates `state` in place:
    1. `state["dm_turn_count"] += 1`.
    2. Whisper firing for the **active beat**: trigger `{"type": "turn_count", "value": N}` fires when `dm_turn_count >= N`; `{"type": "tag", "value": t}` fires when `t in interp["scene_tags"]`. Each whisper fires once (key `f"{beat.id}:{seat}:{index}"` in `fired_whispers`); fired whispers are appended to `state["pending_whispers"][seat]` (consumed by orchestrator on that agent's next turn).
    3. Beat advance: if any tag in the active beat's `advance_when` appears in `interp["scene_tags"]` and a next beat exists → `beat_index += 1`, `beat_changed` = new id, reset `dm_turn_count` to 0.
  - `on_scene_end(spine, state) -> list[str]` — ticks every clock with `tick_on_scene_end` (cap at `segments`), returns ticked names.
  - `dm_screen_state(spine, state, personas, party_hp: dict|None = None) -> dict` — builds the locked `DMScreenState` shape: beats before `beat_index` → `done`, at → `active`, after → `locked`.

- [ ] **Step 1: failing tests**

```python
from firsttable.spine import load_spine
from firsttable.personas import load_personas
from firsttable.director import on_dm_turn, on_scene_end, dm_screen_state


def fresh_state():
    return {"beat_index": 0, "dm_turn_count": 0, "fired_whispers": [],
            "clock_fill": {}, "npc_hp": {}, "pending_whispers": {}}


def interp(tags=(), intent="narration"):
    return {"intent": intent, "addressed_seats": [], "entities": [],
            "scene_tags": list(tags), "skill": None}


def test_turn_count_whisper_fires_once():
    spine, state = load_spine(), fresh_state()
    on_dm_turn(spine, state, interp())
    ev = on_dm_turn(spine, state, interp())
    assert any(w["seat"] == "seat2" for w in ev.whispers_fired)
    ev2 = on_dm_turn(spine, state, interp())
    assert all(w["seat"] != "seat2" for w in ev2.whispers_fired)
    assert state["pending_whispers"]["seat2"]


def test_beat_advances_on_tag():
    spine, state = load_spine(), fresh_state()
    ev = on_dm_turn(spine, state, interp(tags=["lie_exposed"]))
    assert ev.beat_changed == "beat2" and state["beat_index"] == 1


def test_tag_whisper_fires_in_beat2():
    spine, state = load_spine(), fresh_state()
    on_dm_turn(spine, state, interp(tags=["combat_start"]))     # advances to beat2
    ev = on_dm_turn(spine, state, interp(tags=["combat_start"]))
    assert {w["seat"] for w in ev.whispers_fired} == {"seat2", "seat3"}


def test_clock_ticks_on_scene_end():
    spine, state = load_spine(), fresh_state()
    ticked = on_scene_end(spine, state)
    assert ticked == ["The Redtooth Muster"] and state["clock_fill"]["The Redtooth Muster"] == 1
    for _ in range(10):
        on_scene_end(spine, state)
    assert state["clock_fill"]["The Redtooth Muster"] == 4


def test_dm_screen_shape():
    spine, state = load_spine(), fresh_state()
    scr = dm_screen_state(spine, state, load_personas())
    assert scr["beats"][0]["status"] == "active" and scr["beats"][1]["status"] == "locked"
    assert scr["clocks"][0]["filled"] == 0
    assert {n["name"] for n in scr["npcs"]} == {"Grubb Marsh", "Nib"}
    assert len(scr["party_status"]) == 3
```

- [ ] **Step 2: run** → FAIL
- [ ] **Step 3: implement** per interface block (≈90 lines).
- [ ] **Step 4: run** → PASS
- [ ] **Step 5: Commit** `feat: director - beats, whispers, clocks, DM screen state`

---

### Task 12: Orchestrator + FastAPI app

**Files:**
- Create: `server/firsttable/protocol.py`, `server/firsttable/orchestrator.py`, `server/firsttable/main.py`, `server/run.py`
- Test: `server/tests/test_orchestrator.py`, `server/tests/test_api.py`

**Interfaces:**
- `protocol.py`: pydantic models for every locked shape (`ThreadMessage`, `PartyMember`, `DMScreenState`, `Report`, `CampaignState`, WS frames). Plus builders: `dm_message(id, ts, text)`, `agent_message(id, ts, seat, name, reply)`, `system_message(id, ts, text)`, `roll_message(id, ts, roll_view)` returning dicts.
- `orchestrator.Table` — one instance per campaign, created by `main.py` on demand and cached:
  - `Table(cid: int, store: Store, provider, cfg: Config)` — loads spine, personas, campaign state; owns `SpotlightState`, `SceneTelemetry` (both persisted in campaign state json between requests), an `asyncio.Lock` (one DM input at a time), and `rng = random.Random(cfg.seed)` when seed set else `random.Random()`.
  - `async start_scene(emit) -> int` — `emit` is `async fn(frame: dict)`; creates scene row (active beat id), emits `scene started`, then the **cold open** (first scene of a campaign only; later scenes emit a short scripted system re-entry line `"The table settles. [Beat: {title}]"`): for each cold-open entry: `typing` frame → 0.6 s `asyncio.sleep` → `message` frame (persisted via `store.append_message`), `typing_stop`. Records agent turns in telemetry. Emits `dm_screen`.
  - `async handle_dm_input(text, mode, emit)` — the spec §6 pipeline:
    1. persist + emit DM `message`; telemetry `.record_dm`; ledger append.
    2. `interp = await interpreter.interpret(provider, text, personas, recent)`.
    3. `events = director.on_dm_turn(spine, state, interp)`; if `beat_changed` or whispers fired → persist state; if beat changed emit updated `dm_screen` and a `system` message `f"[Beat: {new_title}]"`.
    4. **hesitation check** (before planning): if previous turn set `state["awaiting_hesitation"] = seat` and `seat in interp["addressed_seats"]` → `telemetry.record_hesitation_answered(seat)`; clear flag.
    5. `plan = turn_manager.plan(interp, personas, spotlight, rng)`.
    6. `group_check` intent: for each addressed seat, resolve `rules.resolve_roll_request(sheet, {"kind": "check", "skill": interp["skill"] or "perception"}, npcs, rng)` → emit `roll` messages; then run only `plan.main` as a normal `main` responder reacting to the results.
    7. Otherwise: interjectors first, then main. For each speaker: emit `typing` → `run_agent(provider, persona, mode, thread_tail, whisper=pop pending_whispers)` → emit `typing_stop` + agent `message` (persist; telemetry `.record_agent`; `spotlight.clear(seat)`; ledger). If reply has `roll_request` → resolve via rules with the beat's npc stats → emit `roll` message (persist).
    8. `spotlight.accrue(silent seats)` (seats that did not speak this turn).
    9. If `plan.hesitation` → emit hesitation as an agent `message` (mode `hesitate`, e.g. Wren's "opens her mouth, then closes it") via `run_agent`, record `telemetry.record_hesitation(seat, ts)`, set `state["awaiting_hesitation"] = seat`. (A hesitating agent does not clear spotlight debt.)
    10. Persist state (spotlight + telemetry + director state).
  - `async manual_roll(formula, label, emit)` — `dice.roll` with table rng; emit `roll` message (actor `"DM"`); `DiceError` → `error` frame.
  - `async end_scene(emit) -> dict` — `director.on_scene_end` (tick clocks), `report = report_card.build(telemetry, personas, active_beat.pressure_budget_minutes)` + `scene_id`; `store.end_scene`; emit final `dm_screen`, `scene ended` frame with report; reset telemetry + spotlight in state; returns report.
  - `campaign_state() -> dict` — the locked `CampaignState` shape (party from personas + current hp in state, thread from store, dm_screen from director).
- `main.py`: FastAPI app exposing the locked REST + WS. CORS middleware `allow_origins=["*"]`. Module-level `tables: dict[int, Table]` + `get_table(cid)`. WS handler: accept → send `hello` → loop `receive_json` dispatching `dm_input`/`roll`; a `ConnectionManager` broadcasts frames to all sockets of a campaign; disconnects prune. REST `POST /scenes` and `/scenes/end` drive the same Table with a broadcast emitter (so the WS thread sees cold open / report even though triggered via REST).
- `run.py`: `uvicorn.run("firsttable.main:app", host="0.0.0.0", port=8000)` guarded by `__main__`.

- [ ] **Step 1: failing orchestrator test** (`MockProvider`, in-memory store, collected frames)

```python
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
```

- [ ] **Step 2: failing API test** (`fastapi.testclient.TestClient`, `FIRSTTABLE_PROVIDER=mock`, `FIRSTTABLE_DB=:memory:` via monkeypatch before importing `firsttable.main`)

```python
import importlib


def client(monkeypatch):
    monkeypatch.setenv("FIRSTTABLE_PROVIDER", "mock")
    monkeypatch.setenv("FIRSTTABLE_DB", ":memory:")
    monkeypatch.setenv("FIRSTTABLE_SEED", "7")
    import firsttable.main as m
    importlib.reload(m)
    from fastapi.testclient import TestClient
    return TestClient(m.app)


def test_full_session_over_ws(monkeypatch):
    c = client(monkeypatch)
    cid = c.post("/api/campaigns", json={"name": "Demo"}).json()["id"]
    with c.websocket_connect(f"/ws/{cid}") as ws:
        hello = ws.receive_json()
        assert hello["type"] == "hello" and hello["campaign"]["party"][1]["name"] == "Pix"
        assert c.post(f"/api/campaigns/{cid}/scenes", json={}).status_code == 200
        frames = []
        while True:
            f = ws.receive_json()
            frames.append(f)
            if f["type"] == "dm_screen":
                break
        assert any(f["type"] == "message" for f in frames)
        ws.send_json({"type": "dm_input", "text": "The keeper eyes you. Pix, he singles you out.", "mode": "text"})
        got_agent = False
        while True:
            f = ws.receive_json()
            if f["type"] == "message" and f["message"]["kind"] == "agent":
                got_agent = True
            if f["type"] == "message" and f["message"]["kind"] == "dm":
                continue
            if got_agent and f["type"] not in ("typing", "typing_stop"):
                break
        assert got_agent
        r = c.post(f"/api/campaigns/{cid}/scenes/end", json={})
        assert r.json()["report"]["axes"]["pacing"]["score"] >= 0
    state = c.get(f"/api/campaigns/{cid}").json()
    assert state["scene_active"] is False and len(state["thread"]) > 4
```

- [ ] **Step 3: run both** → FAIL
- [ ] **Step 4: implement `protocol.py`, `orchestrator.py`, `main.py`, `run.py`** per interfaces. Keep `Table.handle_dm_input` under an `asyncio.Lock`. Thread tail for agent context: last 12 messages from `store.thread`. All emitted `message` frames carry the full locked `ThreadMessage` shape (nulls for unused fields).
- [ ] **Step 5: run** `pytest -q` (whole suite) → all PASS
- [ ] **Step 6: Commit** `feat: orchestrator pipeline and FastAPI REST/WS server`

---

### Task 13: Expo scaffold + shared types + socket hook

**Files:**
- Create: `app/` (via create-expo-app), `app/src/types.ts`, `app/src/config.ts`, `app/src/api.ts`, `app/src/hooks/useTableSocket.ts`, `app/src/theme.ts`

**Interfaces:**
- Produces the TS mirror of the locked protocol (`app/src/types.ts`) and `useTableSocket(campaignId) -> { state, thread, typing, report, connected, sendDmInput(text, mode), sendRoll(formula, label), startScene(), endScene(), dismissReport() }` consumed by all screens.

- [ ] **Step 1: scaffold** (from repo root; ~2–4 min, use a 600000 ms timeout)

```bash
npx --yes create-expo-app@latest app --template blank-typescript && cd app && npx expo install react-dom react-native-web
```

- [ ] **Step 2: `app/src/theme.ts`**

```ts
export const theme = {
  bg: "#14100e", panel: "#201a16", card: "#2a221c",
  text: "#efe6d8", dim: "#9c8f7d", accent: "#d9a441", danger: "#c0503f",
  dmBubble: "#3b2f24", agentBubble: "#241f1a", systemText: "#8a7f6e",
  border: "#3a2f26",
} as const;
```

- [ ] **Step 3: `app/src/types.ts`** — transcribe the locked shapes exactly:

```ts
export type MessageKind = "dm" | "agent" | "system" | "roll";
export interface RollResultView { formula: string; rolls: number[]; modifier: number; total: number; label: string; actor: string; outcome: string | null; }
export interface ThreadMessage { id: number; ts: number; kind: MessageKind; seat: string | null; name: string | null; speech: string | null; action: string | null; ooc: string | null; text: string | null; roll: RollResultView | null; }
export interface PartyMember { seat: string; name: string; char_class: string; ancestry: string; level: number; hp: number; max_hp: number; ac: number; mood: string; portrait: string; stats: Record<string, number>; }
export interface BeatView { id: string; title: string; status: "locked" | "active" | "done"; dm_notes: string; secrets: string[]; }
export interface ClockView { name: string; segments: number; filled: number; }
export interface NpcView { name: string; voice_note: string; secret: string; status: string; }
export interface PartyStatus { seat: string; name: string; hp: number; max_hp: number; conditions: string[]; }
export interface DMScreenState { spine_title: string; beats: BeatView[]; clocks: ClockView[]; npcs: NpcView[]; party_status: PartyStatus[]; }
export interface AxisScore { score: number; detail: string; }
export interface Report { scene_id: number; axes: { spotlight: AxisScore; pacing: AxisScore }; drill_suggestion: string; notes: string[]; }
export interface CampaignState { id: number; name: string; scene_active: boolean; scene_id: number | null; party: PartyMember[]; thread: ThreadMessage[]; dm_screen: DMScreenState; }
export type ServerFrame =
  | { type: "hello"; campaign: CampaignState }
  | { type: "message"; message: ThreadMessage }
  | { type: "typing"; seat: string; name: string }
  | { type: "typing_stop"; seat: string }
  | { type: "dm_screen"; dm_screen: DMScreenState }
  | { type: "scene"; status: "started" | "ended"; scene_id: number; report: Report | null }
  | { type: "error"; detail: string };
```

- [ ] **Step 4: `app/src/config.ts`**

```ts
import { Platform } from "react-native";
const host = Platform.OS === "web" && typeof window !== "undefined" ? window.location.hostname : "localhost";
export const SERVER_HTTP = `http://${host}:8000`;
export const SERVER_WS = `ws://${host}:8000`;
```

- [ ] **Step 5: `app/src/api.ts`** — `createCampaign(name)`, `listCampaigns()`, `getCampaign(id)`, `startScene(id)`, `endScene(id)` as thin `fetch` wrappers returning parsed JSON, throwing on `!res.ok`.

- [ ] **Step 6: `app/src/hooks/useTableSocket.ts`** — full implementation:

```ts
import { useCallback, useEffect, useRef, useState } from "react";
import { SERVER_WS } from "../config";
import * as api from "../api";
import { CampaignState, DMScreenState, Report, ServerFrame, ThreadMessage } from "../types";

export function useTableSocket(campaignId: number) {
  const [state, setState] = useState<CampaignState | null>(null);
  const [thread, setThread] = useState<ThreadMessage[]>([]);
  const [typing, setTyping] = useState<Record<string, string>>({});
  const [dmScreen, setDmScreen] = useState<DMScreenState | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [sceneActive, setSceneActive] = useState(false);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    let alive = true;
    let ws: WebSocket;
    let retry: ReturnType<typeof setTimeout>;
    const connect = () => {
      ws = new WebSocket(`${SERVER_WS}/ws/${campaignId}`);
      wsRef.current = ws;
      ws.onopen = () => alive && setConnected(true);
      ws.onclose = () => { if (alive) { setConnected(false); retry = setTimeout(connect, 1500); } };
      ws.onmessage = (ev) => {
        if (!alive) return;
        const frame: ServerFrame = JSON.parse(ev.data as string);
        switch (frame.type) {
          case "hello":
            setState(frame.campaign);
            setThread(frame.campaign.thread);
            setDmScreen(frame.campaign.dm_screen);
            setSceneActive(frame.campaign.scene_active);
            break;
          case "message":
            setThread((t) => [...t, frame.message]);
            if (frame.message.seat) setTyping((ty) => { const n = { ...ty }; delete n[frame.message.seat!]; return n; });
            break;
          case "typing":
            setTyping((ty) => ({ ...ty, [frame.seat]: frame.name }));
            break;
          case "typing_stop":
            setTyping((ty) => { const n = { ...ty }; delete n[frame.seat]; return n; });
            break;
          case "dm_screen":
            setDmScreen(frame.dm_screen);
            break;
          case "scene":
            setSceneActive(frame.status === "started");
            if (frame.status === "ended" && frame.report) setReport(frame.report);
            break;
          case "error":
            setError(frame.detail);
            break;
        }
      };
    };
    connect();
    return () => { alive = false; clearTimeout(retry); ws?.close(); };
  }, [campaignId]);

  const send = useCallback((obj: object) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) wsRef.current.send(JSON.stringify(obj));
  }, []);
  const sendDmInput = useCallback((text: string, mode: "voice" | "text") => send({ type: "dm_input", text, mode }), [send]);
  const sendRoll = useCallback((formula: string, label: string) => send({ type: "roll", formula, label }), [send]);
  const startScene = useCallback(() => api.startScene(campaignId), [campaignId]);
  const endScene = useCallback(() => api.endScene(campaignId), [campaignId]);
  const dismissReport = useCallback(() => setReport(null), []);

  return { state, thread, typing, dmScreen, report, sceneActive, connected, error,
           sendDmInput, sendRoll, startScene, endScene, dismissReport };
}
```

- [ ] **Step 7: typecheck** `cd app && npx tsc --noEmit` → clean
- [ ] **Step 8: Commit** `feat: expo scaffold, protocol types, table socket hook`

---

### Task 14: The Table screen — thread, input bar, quick chips, hold-to-talk

**Files:**
- Create: `app/src/components/MessageBubble.tsx`, `app/src/components/TypingRow.tsx`, `app/src/components/ChatThread.tsx`, `app/src/components/QuickChips.tsx`, `app/src/components/InputBar.tsx`, `app/src/speech.ts`, `app/src/screens/TableScreen.tsx`
- Modify: `app/App.tsx`

**Interfaces:**
- Consumes: `useTableSocket`, `theme`, types.
- Produces: `<TableScreen campaignId onOpenDrawer onShowReport />`; `InputBar` props `{ onSend(text: string, mode: "voice"|"text"): void, disabled: boolean }`; `ChatThread` props `{ thread: ThreadMessage[], typing: Record<string,string>, party: PartyMember[] }`.

- [ ] **Step 1: `MessageBubble`** — per spec §9: agent bubbles left-aligned with portrait emoji avatar circle + name label; in-character `speech` plain text; `action` *italicized* on its own line (render as `*{action}*` italic style); `ooc` gray prefixed `(ooc)`; DM messages right-aligned in `dmBubble`; `system` centered small gray text; `roll` messages a compact card: `🎲 {label} — {actor}` header, `d20+3 → [14] +3 = 17` line, bold `outcome` when present.
- [ ] **Step 2: `TypingRow`** — small left-aligned row `"{name} is typing"` with three animated dots (Animated loop, 400 ms stagger).
- [ ] **Step 3: `ChatThread`** — `FlatList` of `thread` + trailing typing rows; auto-scroll on new items via `onContentSizeChange` → `scrollToEnd`; `keyExtractor` = message id.
- [ ] **Step 4: `QuickChips`** — horizontal scroll of pill buttons above the input bar (spec §9 quick chips): `"Roll perception, everyone"`, `"What do you do?"`, `"Describe your surroundings"` (sends `dm_input` with prefix `(ooc) recap:` — no, send as-is), `"Cut to…"` (prefills the input instead of sending). Props `{ onSend(text): void, onPrefill(text): void }`.
- [ ] **Step 5: `speech.ts`** — hold-to-talk (web only in slice; native falls back to text):

```ts
type Recognizer = { start(): void; stop(): void };
export const speechAvailable = (): boolean =>
  typeof window !== "undefined" && !!((window as any).webkitSpeechRecognition || (window as any).SpeechRecognition);

export function createRecognizer(onResult: (text: string) => void, onEnd: () => void): Recognizer | null {
  if (!speechAvailable()) return null;
  const Ctor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  const rec = new Ctor();
  rec.continuous = true; rec.interimResults = false; rec.lang = "en-US";
  let buffer = "";
  rec.onresult = (e: any) => { for (let i = e.resultIndex; i < e.results.length; i++) buffer += e.results[i][0].transcript; };
  rec.onend = () => { if (buffer.trim()) onResult(buffer.trim()); onEnd(); };
  return { start: () => { buffer = ""; rec.start(); }, stop: () => rec.stop() };
}
```

- [ ] **Step 6: `InputBar`** — `TextInput` (multiline, send on submit) + send button + **mic button**: `Pressable` with `onPressIn` start / `onPressOut` stop when `speechAvailable()`; while held, tint accent + label "listening…"; recognized text goes through `onSend(text, "voice")`. When unavailable, mic press shows a one-line hint `Alert`/inline note: "Voice input runs in the web build for now — type away." (spec pillar 1: voice-first, text fallback).
- [ ] **Step 7: `TableScreen`** — layout: header (campaign name, connection dot, `Scene ▸ End scene` / `Start scene` button, `🛡️ DM Screen` button), `ChatThread` filling space, `QuickChips`, `InputBar` bottom (KeyboardAvoidingView). When no scene is active and thread is empty, show a centered "Take your seat" panel with a `Start the scene` button that calls `startScene()`. When `report` arrives, call `onShowReport(report)`.
- [ ] **Step 8: `App.tsx`** — state machine: `{screen: "home"} | {screen: "table", campaignId} | {screen: "report", campaignId, report}`; render Home (Task 15), Table, ReportCard (Task 15). Wrap in `SafeAreaView`, dark `StatusBar`, `theme.bg` background. (Home/Report components land in Task 15; for this commit, `App.tsx` may hard-render `TableScreen` behind a `TEMP_CAMPAIGN_ID = 1` guard — replaced next task.)
- [ ] **Step 9: typecheck** `npx tsc --noEmit` → clean
- [ ] **Step 10: Commit** `feat: table screen - thread, bubbles, chips, hold-to-talk input`

---

### Task 15: Dice tray, DM Screen drawer, Report card, Home — full app wiring

**Files:**
- Create: `app/src/components/DiceTray.tsx`, `app/src/components/DMDrawer.tsx`, `app/src/screens/ReportCardScreen.tsx`, `app/src/screens/HomeScreen.tsx`
- Modify: `app/src/screens/TableScreen.tsx`, `app/App.tsx`

**Interfaces:**
- Consumes: `useTableSocket` outputs, `api.createCampaign/listCampaigns`.
- Produces: `<DiceTray visible onClose onRoll(formula,label) lastRoll />`, `<DMDrawer visible onClose dmScreen />`, `<ReportCardScreen report onDone />`, `<HomeScreen onEnterTable(campaignId) />`.

- [ ] **Step 1: `DiceTray`** — bottom sheet (Modal, slide animation): grid of buttons `d4 d6 d8 d10 d12 d20 d100`, a `2d6` and `d20+5` shortcut row, each calls `onRoll(formula, "Table roll")`; shows the last `roll` ThreadMessage result big (`total`) with the individual dice small. Opened from a `🎲` button in TableScreen header; swipe-down/backdrop closes.
- [ ] **Step 2: `DMDrawer`** — right-side drawer (absolute-positioned Animated.View, translateX spring; backdrop press closes; also a `‹ close` handle): titled "DM Screen — private". Sections: **Beats** (each `BeatView`: status glyph ○ active ●, done ✓, locked 🔒 + title; active beat expands `dm_notes` + `secrets` bullets), **Clocks** (name + segment pips `●●○○`), **NPCs** (cards: name, voice_note italic, secret prefixed 🤫, status), **Party** (hp bars `hp/max_hp`). This is the sacred private space (spec §9) — visually distinct: darker panel, gold border.
- [ ] **Step 3: `ReportCardScreen`** — spec §8: full-screen swipeable story-cards (horizontal paging FlatList, page indicators): card 1 "Spotlight" (big score, detail), card 2 "Pacing" (same), card 3 "Coach's corner" (the `notes` lines + `drill_suggestion` in an accent box + `Back to the table` button → `onDone`). 30-second read, corner-coach tone comes from server strings.
- [ ] **Step 4: `HomeScreen`** — spec §9 campaign home, slice version: title "First Table", tagline "Run your first table before you run your first table."; list of existing campaigns (from `listCampaigns`) as cards → `onEnterTable(id)`; `New campaign` button → `createCampaign("The Goblin Toll")` → enter table; footer: SRD 5.1 CC-BY-4.0 attribution line ("Includes SRD 5.1 material by Wizards of the Coast LLC, CC-BY-4.0. 5E-compatible.").
- [ ] **Step 5: wire `App.tsx`** fully (remove TEMP guard): home → table → report → table loop.
- [ ] **Step 6: typecheck** `npx tsc --noEmit` → clean
- [ ] **Step 7: Commit** `feat: dice tray, DM screen drawer, report card, home`

---

### Task 16: Integration verification (mock + live Ollama)

**Files:**
- Create: `README.md` (root — how to run server + app, env vars, provider setup)

- [ ] **Step 1: backend suite** — `cd server && .venv/Scripts/python -m pytest -q` → all green.
- [ ] **Step 2: boot server (mock)** — `FIRSTTABLE_PROVIDER=mock FIRSTTABLE_SEED=7 server/.venv/Scripts/python server/run.py` (background). `GET http://localhost:8000/api/campaigns` → `[]`.
- [ ] **Step 3: boot Expo web** — `cd app && npx expo start --web --port 8081` (background).
- [ ] **Step 4: drive the app in a browser** — create campaign → start scene → confirm cold open bubbles appear with typing animation, party speaks first → send DM input → typing indicator → agent reply → `Roll perception, everyone` chip → three roll cards → open DM Screen drawer (beats/clocks/NPCs render) → dice tray roll → end scene → report card renders with two axis cards + drill. Screenshot each key state.
- [ ] **Step 5: live model smoke test** — restart server with `FIRSTTABLE_PROVIDER=ollama`; one DM input round-trip; confirm in-character JSON replies parse (qwen3.5:9b). If Ollama output is malformed the safe-fallback path must keep the table alive.
- [ ] **Step 6: write `README.md`** — run instructions (server venv, env vars, expo web/Go), provider matrix (mock/ollama/anthropic incl. `ANTHROPIC_API_KEY` + spec model tiering), what's in the slice vs. cut, SRD attribution.
- [ ] **Step 7: Commit** `docs: README and integration verification`

---

## Self-review notes (done at plan time)

- Spec coverage vs. §14 Phase 1 list: Expo shell (T13–15) ✓ · hold-to-talk + text (T14) ✓ · orchestrator Interpreter→TurnMgr→3 agents (T9,6,10,12) ✓ · dice/rules checks + basic combat math (T2,3) ✓ · Goblin Toll beats 1–2 (T4) ✓ · cold-open scripted scene (T4,12) ✓ · report card v1 spotlight+pacing telemetry-only (T7) ✓ · single hard-coded knob preset (personas.json values; sliders deliberately absent) ✓ · cuts honored (no TTS/push/leveling/Layer-2/Brannek/judge) ✓.
- Spec mechanics kept: spotlight debt + hesitation (§6) T6/T12 · whispers (§7.2) T4/T11 · clocks (§7.3) T4/T11 · latency-masking interjections (§3) T12 · dice sacred (§6) T2/T10 (agents only request) · DM screen drawer (§9) T15 · IP hygiene (§12) T4 test + ATTRIBUTION.md.
- Type consistency: `ThreadMessage`/`Report`/`DMScreenState` defined once in "Locked protocol", transcribed in T12 (pydantic) and T13 (TS) — field names match. `AgentReply.roll_request` shape identical in T8 mock, T10 schema, T3 resolver.
