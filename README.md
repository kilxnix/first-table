# First Table

**You are the DM. The party is AI.** A phone-shaped 5E-compatible trainer where a persistent
party of AI player characters sits at your table: you narrate, they answer — in character,
out of turn, with agendas — and after every scene the app grades your DM craft.

This repo is **Phase 1 — "The Slice"** from [FIRST_TABLE_design_spec.md](FIRST_TABLE_design_spec.md) §14:

- Group-chat table UI (Expo / React Native): message thread, typing indicators, hold-to-talk
  (web), quick chips, animated dice tray, private **DM Screen** drawer (beats, secrets,
  clocks, NPCs, party HP), swipeable post-scene report card.
- FastAPI orchestrator: Interpreter → Turn Manager (spotlight debt + hesitation) → player
  agents (Marcus the rules lawyer, Pix the chaos gremlin, Wren the shy newbie) → seeded
  dice/rules service → Director (beat graph, private whispers, threat clock).
- Scenario spine: **"The Goblin Toll"**, beats 1–2, with a scripted cold open — the party
  always speaks first; your first act as DM is reacting, never facing a blank page.
- Report card v1: **Spotlight** (Gini over seek-weighted turns, hesitation bonuses) and
  **Pacing** (dead air, scene length) — pure telemetry, plus a drill suggestion.

Cut from the slice (per spec): TTS/Table Mode, push texting, XP/leveling, social learning,
Brannek (seat 4), LLM judge, contradiction detector, initiative rail.

## Run it

### 1. Backend (FastAPI, port 8000)

```powershell
cd server
python -m venv .venv                       # once
.venv\Scripts\python -m pip install -r requirements.txt   # once
$env:FIRSTTABLE_PROVIDER = "ollama"        # or "mock" (offline) / "anthropic"
.venv\Scripts\python run.py
```

### 2. App (Expo, port 8081)

```powershell
cd app
npm install                                # once
npx expo start --web                       # browser; or scan the QR in Expo Go
```

Open http://localhost:8081 → **New campaign** → **Start the scene**.

### Tests

```powershell
cd server
.venv\Scripts\python -m pytest -q
```

The suite runs fully offline against the deterministic `mock` provider.

## LLM providers

| `FIRSTTABLE_PROVIDER` | What it uses | When |
|---|---|---|
| `mock` (default) | Canned in-character replies, heuristic interpreter | Tests, offline demo |
| `ollama` | Local Ollama, `FIRSTTABLE_OLLAMA_MODEL` (default `qwen3.5:9b`) | Free local dev |
| `anthropic` | Claude API, `FIRSTTABLE_ANTHROPIC_MODEL` (default `claude-haiku-4-5`, per spec §10 tiering; needs `ANTHROPIC_API_KEY`) | Production quality |

Other env vars: `FIRSTTABLE_DB` (SQLite path), `FIRSTTABLE_SEED` (deterministic dice),
`FIRSTTABLE_OLLAMA_URL`.

## Layout

```
server/firsttable/   orchestrator, turn manager, director, rules/dice, telemetry, report card
server/firsttable/content/   personas.json, goblin_toll.json (spine), SRD attribution
server/tests/        pytest suite (70 tests, offline)
app/src/             Expo app: screens, components, WS hook, protocol types
docs/superpowers/plans/      the implementation plan this slice was built from
```

## Legal

Includes material from the System Reference Document 5.1 by Wizards of the Coast LLC,
licensed under CC-BY-4.0 — see [server/firsttable/content/ATTRIBUTION.md](server/firsttable/content/ATTRIBUTION.md).
First Table is 5E-compatible; all scenario content, characters, and names are original.
