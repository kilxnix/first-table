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

### 3. Phone (Android APK)

Every `v*` tag (or a manual run of the **Android APK** workflow) builds a sideloadable,
debug-signed APK on GitHub Actions and attaches it to the release — download
`first-table.apk` from the repo's Releases page on your phone and install it
(allow "install unknown apps" when prompted).

The app talks to your PC over Wi-Fi: keep the backend running, make sure phone and PC
are on the same network, and set **⚙ Table server** on the app's Home screen to your
PC's LAN IP (e.g. `192.168.4.20`). If the phone can't connect, allow Python through
Windows Firewall for private networks, e.g. (admin PowerShell):

```bash
netsh advfirewall firewall add rule name="First Table server" dir=in action=allow protocol=TCP localport=8000
```

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
| `hub` | Remote agent workers (below); falls back to `FIRSTTABLE_HUB_FALLBACK` (default `mock`) when no worker is online | Public server, agents elsewhere |

Other env vars: `FIRSTTABLE_DB` (SQLite path), `FIRSTTABLE_SEED` (deterministic dice),
`FIRSTTABLE_OLLAMA_URL`, `FIRSTTABLE_HUB_TOKEN` (worker auth; generated + logged if unset).

## Agent hub — play from anywhere, run agents anywhere

In `hub` mode the server queues each agent/interpreter LLM call as a **job**; any number
of **workers** connect *outbound*, claim jobs, run inference with whatever model they
have, and post the moves back. The device serving the table needs no model or keys.

```powershell
# 1. The hub (public table server)
$env:FIRSTTABLE_PROVIDER = "hub"; $env:FIRSTTABLE_HUB_TOKEN = "<pick-a-secret>"
.venv\Scripts\python run.py

# 2. Make it public (free quick tunnel; URL changes per restart)
cloudflared tunnel --url http://localhost:8000

# 3. A worker, on any machine with Python + an LLM
$env:FIRSTTABLE_HUB_URL = "https://<your-tunnel>.trycloudflare.com"
$env:FIRSTTABLE_HUB_TOKEN = "<same-secret>"
$env:FIRSTTABLE_WORKER_PROVIDER = "ollama"   # or anthropic / mock
.venv\Scripts\python worker.py
```

Phones find the table automatically: at launch (when you haven't saved an override)
the app fetches a **server pointer** — a secret gist naming the current public URL —
so a rotated tunnel URL never requires an APK rebuild. After restarting the tunnel run
`.\tools\update-server-pointer.ps1 -Url https://<new>.trycloudflare.com`. You can
always override manually via **⚙ Table server** on the Home screen (also reachable
from the "Set server address" button when the server is unreachable). Worker API (bearer-token
protected): `GET /api/hub/jobs?wait=25` long-polls for a job `{job_id, system,
messages, schema}`; `POST /api/hub/jobs/{job_id}` submits `{result}` or `{error}`;
`GET /api/hub/status` shows workers online. If a worker fails or nobody's connected,
the table degrades gracefully (fallback provider / safe in-character fallbacks) —
a scene never stalls. Note: game endpoints are unauthenticated in this slice; the
quick-tunnel URL is unlisted but treat it as semi-public and rotate it freely.

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
