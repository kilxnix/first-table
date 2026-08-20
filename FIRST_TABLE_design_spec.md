# FIRST TABLE
### Complete Product & System Design — v1.0
*Working title. Naming is your call — pillars below don't change.*

**One line:** A phone app where you are the Dungeon Master and a persistent party of AI player agents plays at your table — a flight simulator for DMs, disguised as the most convenient game of 5E you've ever run.

**The promise:** Run your first table before you run your first table.

---

## 1. Product Definition

### What it is
The user opens the app and sits down at a table that already exists: three to four AI player characters with sheets, personalities, goals, grudges, and memory of everything that has happened in the campaign. The user narrates the world by voice or text. The party responds like a real group chat — in character, out of turn, with agendas. Scenarios provide structure, threat clocks provide momentum, and after every scene the app grades the DM's craft: spotlight balance, pacing, ruling accuracy, consistency, improv.

### What it is not
- **Not a click adventure.** There are no multiple-choice branches. The DM speaks freely; the agents respond freely. Structure comes from beat graphs and clocks underneath, never from buttons on the surface.
- **Not another AI DM.** The entire commercial space (Friends & Fables, AI Dungeon, Jenova, HyperWrite, mobile AI-GM apps) puts the AI in the DM chair. This inverts it. The only prior art is one open-source hobby repo (May 2026) built for personal play — no product, no training layer, no mobile.
- **Not a rules tutor.** Rules knowledge is a side effect. The product trains the *performance* skill: running a table.

### Who it's for
1. **Aspiring DMs** (primary). The D&D player base has a permanent, well-documented DM shortage. Millions want to run a game; the blocker is fear of the first table, not lack of information.
2. **Rusty/anxious DMs** prepping a real session — dress-rehearse tonight's dungeon against AI players before humans arrive.
3. **Solo TTRPG players** who prefer the DM seat (the audience the hobby repo proved exists).
4. **Forever-DMs** who want a table that never cancels.

---

## 2. Design Pillars

1. **The DM talks, the table answers.** DMing is a spoken skill. Voice-first input (hold-to-talk), because typing narration on a phone kills the rep.
2. **Players are people, not options.** Persistent agents with sheets, agendas, moods, and memory. They call back your NPCs, notice your retcons, hold grudges across sessions.
3. **The story drives itself through the players.** The blank-page problem is fatal for a DM trainer. Drive comes from three stacked systems — scenario spines, player agendas, threat clocks — so the DM improvises freely but the world always pushes back.
4. **Everything is a rep.** Every scene emits telemetry. The app is a coach wearing a game's clothes.
5. **Scenes, not sessions.** The play unit is 10–20 minutes. A campaign is a chain of scenes. Fits a phone life; keeps token costs bounded.
6. **You get the table you cultivate.** Agents learn from the DM's rulings. Permissive rulings breed bolder players; fair spotlighting builds party cohesion. Long-term, the DM is literally training their table — which is exactly what real DMing is.

---

## 3. The Core Loop

```
┌─────────────────────────────────────────────────┐
│  SCENE (10–20 min)                              │
│                                                 │
│  1. Cold open — party speaks FIRST              │
│  2. DM narrates (voice/text)                    │
│  3. Turn Manager picks 1–3 responders           │
│  4. Agents respond + interject (group chat feel)│
│  5. Checks/combat → dice service resolves       │
│  6. Director fires whispers/clocks/agendas      │
│  7. Beat resolves → scene closes                │
│                                                 │
│  → REPORT CARD (30 sec)                         │
│  → Ledger written, memories updated             │
│  → Downtime: agents text the DM between scenes  │
└─────────────────────────────────────────────────┘
```

### The cold-start inversion (critical)
The DM never faces a blank page. **Every scene opens with the party already talking.** First-ever launch: the user "walks in late" — the table is mid-argument about marching order and turns to them: *"Finally. Okay, where were we — we're at the toll bridge, right? What do we see?"* The DM's first act is always *reacting*, never inventing from silence. This single design choice is the difference between a trainer and a blank-page anxiety machine.

### Turn cadence
- DM input → 300–800ms → first interjection streams in (one-liner from the most reactive agent) → main response(s) compose. Interjections mask LLM latency and create table energy.
- Not every agent answers every time. Real tables have rhythm; four full replies per narration reads as a form, not a table.

---

## 4. The Cast — Agent Design

Four archetype seats. Each is a persona configuration over the same agent chassis. Each archetype is also a *training instrument* — it exists to build a specific DM muscle.

| Seat | Archetype | Behavior | DM muscle it trains |
|---|---|---|---|
| 1 | **The Rules Lawyer** (e.g., "Marcus," human wizard) | Challenges rulings, cites actual SRD text, argues action economy | Rules confidence; ruling under pressure; when to say "my table, my call" |
| 2 | **The Chaos Gremlin** (e.g., "Pix," goblin rogue) | Derails, steals, licks the artifact, splits the party | Improv; consequence design; regaining control without railroading |
| 3 | **The Shy Newbie** (e.g., "Wren," half-elf cleric) | Hangs back, defers, goes quiet when ignored | Facilitation; spotlight management — **your grade depends on drawing them out** |
| 4 | **The Actor** (e.g., "Brannek," dwarf fighter) | Deep backstory, in-character monologues, emotional stakes | Narrative weaving; honoring player investment; callback craft |

### Agent chassis (every seat has)
```json
{
  "sheet": { "srd51_legal": true, "class": "...", "stats": {}, "hp": 0,
             "slots": {}, "inventory": [], "level": 1, "xp": 0 },
  "personality": {
    "chaos": 0.0-1.0,          // off-script probability
    "pedantry": 0.0-1.0,       // rules-challenge probability
    "spotlight_seek": -1.0-1.0, // negative = avoids it
    "risk": 0.0-1.0,
    "voice_style": "prompt fragment + TTS profile id"
  },
  "agendas": {
    "public_goal": "reach Ironhold before the thaw",
    "private_secret": "is fleeing a debt to the Thieves' Guild",
    "session_want": "impress Wren"     // rotates per scene
  },
  "memory": {
    "ledger_refs": [],          // event ids this agent witnessed
    "relationships": { "dm_npcs": {}, "party": {}, "dm_trust": 0.5 },
    "mood": "wary"
  }
}
```

- **Personality vector = difficulty knobs.** The settings screen literally exposes chaos/pedantry/off-script sliders per seat, and the curriculum (§8) turns them automatically.
- **Custom seats** (post-MVP): users design their own players or import a friend's real character to rehearse for a real campaign.

---

## 5. The Learning System (three layers)

"Learning agents" means three distinct things here. All three ship, in this order.

### Layer 1 — Character learning (MVP)
Agents progress as characters: SRD-legal XP, leveling, loot, conditions. Mechanical state is code, never LLM memory. They also *remember the fiction*: the ledger (§11) means Marcus recalls the innkeeper's name from six scenes ago and objects when the DM contradicts it. A contradiction-detection pass compares new narration against ledger facts — caught retcons become both an in-character player reaction *and* a consistency ding on the report card.

### Layer 2 — Social learning (MVP-adjacent, Phase 2)
After each scene, a reflection pass updates each agent's relationship graph and mood:
- `dm_trust` rises with fair rulings and honored player ideas; falls with railroading and ignored input.
- Party bonds/grudges shift from in-fiction events (Pix stole Brannek's axe → grudge persists until addressed).
- **Behavioral consequence:** trust modulates the personality vector at runtime. A railroaded gremlin escalates chaos +0.1/scene. A spotlighted newbie's `spotlight_seek` slowly rises toward zero — she comes out of her shell *because you drew her out.* The table visibly becomes the table you cultivated. This is the deepest retention loop in the design.

### Layer 3 — Curriculum learning (Phase 3)
The system learns the *DM*. Report-card history feeds a difficulty scheduler that adjusts knob baselines and selects which drills and whispers to fire — calm skies until you can land, then engine fires. Implementation is simple mastery-tracking (per-skill EMA of scores → knob targets), not RL. Don't overbuild this.

---

## 6. The Table Engine (orchestration)

Server-side pipeline per DM input:

```
DM input (voice→STT on device→text)
  │
  ▼
[1] INTERPRETER (small model, structured output)
    → intent: narration | npc_dialogue | ruling | ooc | combat_action
    → entities touched, ledger writes, contradiction check
  │
  ▼
[2] TURN MANAGER (code + small model)
    → scores each agent: relevance × personality × spotlight_debt
    → selects 1 main responder + 0–2 interjectors
  │
  ▼
[3] PLAYER AGENTS (parallel calls, cheap model, persona-cached)
    → in-character action + dialogue, structured:
      { speech, action, roll_request?, ooc? }
  │
  ▼
[4] RULES SERVICE (pure code — dice, DCs, action economy, SRD data)
    → resolves rolls deterministically; flags illegal actions
  │
  ▼
[5] DIRECTOR (mid-tier model, runs async every N turns)
    → beat tracking, clock ticks, whisper/agenda firing (§7)
  │
  ▼
[6] TELEMETRY → ledger, spotlight counters, pacing timestamps
```

### Key mechanics
- **Spotlight debt:** every agent accrues debt while silent, weighted by `spotlight_seek`. Wren accrues silently and *won't* claim it — the Turn Manager surfaces her hesitantly ("Wren opens her mouth, then closes it") and the DM's response is scored. Pix steals debt he hasn't earned. Managing this ledger *is* the facilitation curriculum.
- **Combat mode:** initiative rail UI; agents declare sheet-legal actions; rules service resolves; DM narrates outcomes. A **Rule of Cool override button** lets the DM overrule anything — overrides are logged, may trigger Marcus, and are graded as *rulings* (decisiveness scores well even when technically wrong; the feedback explains the RAW after the scene, never during).
- **Dice are sacred:** all randomness from a seeded server-side dice service with an animated tray on the client. The LLM never rolls, never does math.

---

## 7. The Story Engine — solving "driven story"

The design tension: the human drives the story (they're the DM), but the app must never feel like an empty sandbox. Resolution: **the world and the players carry narrative momentum; the DM steers it.** Three stacked systems:

### 7.1 Scenario Spines
Adventures ship as **beat graphs**, not scripts — 5-Room-Dungeon grammar (Hook → Guardian → Puzzle/Roleplay → Setback → Climax → Reveal). Each beat defines:
- `entry_conditions` (fiction states that open it)
- `pressure_budget` (how long before the world escalates)
- `whispers` (see below)
- `fallback_escalation` (what the Director does if the table stalls)

The DM sees the spine in their private **DM Screen drawer** (beats, NPC cards, secrets) — the app hands them prep, they perform it. Launch spine: **"The Goblin Toll"** — a bridge, a toll, a lie, a lair. Teaches negotiation, first combat, and one moral fork in ~4 scenes.

### 7.2 Whispers
The Director sends *private nudges to individual agents*, invisible to the DM: *"Pix — you recognize the toll-keeper's tattoo. Guild mark. Press him."* The result: players proactively generate plot pressure, ask pointed questions, chase hooks — exactly how real players drive a story. The DM experiences a table full of motivated people, not a chatbot waiting for input.

### 7.3 Threat Clocks + Agendas
- **Clocks** (PbtA-style fronts): the villain's plan advances on scene ticks and stall ticks. If the DM dawdles, the world moves — smoke on the horizon, the caravan leaves, the ritual completes a stage. Momentum without railroading the DM.
- **Agenda ignition:** beats trigger player secrets. Brannek's estranged brother is the toll-keeper's prisoner (fires at Setback). Pix's kleptomania fires in the lair vault. Player backstory becomes plot on a timer.

**Failure-path guarantee:** every beat has a fail-forward branch. TPKs, blown negotiations, and derails route to new spine states (capture, debt, reputation) — the story is *driven*, never dead-ended.

### 7.4 Downtime texting (Phase 2)
Between scenes, agents message the DM via push notification, in character, in a group thread: *"are we playing tonight?"* — *"Brannek is NOT over the bridge thing btw."* — *"I looked up guild law. We need to talk. — M."* Retention hook, realism engine, and re-entry ramp in one feature.

---

## 8. The Coaching Layer

### Report card (after every scene, six axes)
| Axis | How it's measured | Type |
|---|---|---|
| **Spotlight** | Gini coefficient over turn ledger, weighted by seek/avoid | Pure telemetry |
| **Pacing** | Dead-air gaps, scene length vs. beat pressure budget, combat round duration | Pure telemetry |
| **Rulings** | Rules-service diff on overrides + decisiveness timing | Telemetry + rubric |
| **Consistency** | Contradiction detector hits vs. ledger | Telemetry |
| **Improv** | Judge-model rubric on responses to off-script moves (accept/build vs. block) | LLM judge |
| **Table mood** | Aggregate agent trust/mood delta | Derived |

Delivered as swipeable story-cards, 30 seconds, one concrete drill suggestion, never a lecture. Tone: corner coach, not schoolmarm.

### Drill library (10-minute focused reps)
"The Derail" · "The Rules Dispute" · "The Silent Player" · "The Split Party" · "Session Zero" · "The TPK Call" · "Improvised NPC" · "The Negotiation." Each drill = one scene, extreme knob settings, single-axis grading.

### Progression
Skill badges → **"Table Ready"** certificate arc (finish a full spine above threshold across all axes). The endgame promise is explicit: *graduate to a human table.* Partner-ready hook for game stores / Adventurers League feeder funnels later.

---

## 9. Phone UI Specification

**The unlock: the entire game is a group chat.** Everyone on earth already knows how to read a rowdy thread. No VTT, no hex maps, no learning curve.

### Main screen — The Table
- Chat thread: agent messages as bubbles with avatar + name; in-character speech plain, *actions italicized*, OOC in gray. Interjections animate in like typing-indicator pops.
- **DM input bar:** hold-to-talk (primary), keyboard fallback, quick-chips for common DM moves ("Roll perception, everyone" / "Describe surroundings" / cut-to-scene).
- **Dice tray:** swipe up; animated rolls; results post to thread.
- **Initiative rail:** horizontal avatar strip appears in combat; tap an avatar for sheet peek.

### DM Screen (private drawer, swipe from right)
Spine beats with progress, NPC cards (name/voice note/secret), active clocks, party status grid. This *is* the DM screen from a physical table — the sacred private space.

### Other surfaces
- **Report card:** full-screen swipeable cards post-scene.
- **Campaign home:** party portraits w/ mood glyphs, next-scene hook, downtime thread.
- **Settings:** per-seat personality sliders, TTS toggles, session length.

### Audio
- STT on-device (free, private, fast).
- TTS per agent optional (off by default — cost + many will play silently in public). Distinct inexpensive voices; the Actor's voice is the demo-video money shot.

---

## 9.5 The Presence Layer — TABLE MODE

**Design thesis:** a DM's presence at a real table is auditory and social, not visual. Behind the screen you aren't looking at anything — you're hearing people and being watched by them. Graphics would turn this into a video game and delete the fantasy being sold. Table Mode makes the phone disappear.

**The mode:** phone face-down or docked, earbuds recommended. The DM speaks; the table speaks back. The chat thread (§9) remains — demoted to *transcript*, reviewed after. The session is lived, not read.

### Components (in order of load-bearing)

1. **The backchannel (reaction layer).** A tiny classifier fires reaction audio within ~400ms of DM speech: laughter when a joke lands, a low "ohhh" on a reveal, Marcus's sharp inhale before an objection, dice fidgeting, a chair creak. Latency is the enemy of presence; backchannel is how conversation feels alive. Entirely canned/procedural audio → instant and near-zero cost, bridging the gap while full replies compose.
2. **The world obeys the DM's voice.** The Interpreter already tags scene/mood from narration; the ambient engine reacts in <1s. "You enter the cavern" → reverb + drips. Steel drawn → percussion bed. DM whispers → the mix ducks. Narration acquires immediate sensory consequence — the core experiential loop.
3. **Spatial seating.** Client-side stereo panning: Marcus front-left, Wren right, Pix roaming. With earbuds, the party is physically *around* the DM. Trivial to implement; feels like witchcraft.
4. **Landed moments.** Prosody features (energy, pitch delta) + content signals detect when the DM *performed* — an NPC voice, a joke, a dramatic beat — and the table reacts to the performance itself ("do the voice again"). The dopamine of DMing is landing a moment; the app must pay it out. Feeds the Improv axis (§8).
5. **Designed silence.** After heavy reveals, the Director enforces 2–3 seconds of nothing but room tone before anyone speaks. Silence is the most expensive-feeling audio there is.
6. **Emotional voice.** Per-agent TTS with emotion tags — Wren's voice falters when scared, Brannek goes quiet-angry. Mood state (§5, Layer 2) drives delivery, not just word choice.
7. **Haptics.** Dice rumble on roll, sharp double-tap on crits, ominous pulse on clock ticks, gentle nudge on initiative turns.
8. **Ritual.** "Lights down" session open: screen dims to a candlelit table, recap plays *in the players' voices* ("previously, on our extremely stupid adventure…"). Ritual boundaries create presence; the recap doubles as re-entry ramp.
9. **Co-DM earpiece (optional).** Spine beats and NPC secrets whispered privately mid-scene, producer-in-your-ear style, so the DM stays in flow instead of reading the drawer.

### Visuals stay abstract
A **mood canvas** — light/color/particle shifts matching scene tags — never literal AI scene art by default. The DM's imagination is the renderer; the app's job is to make it feel *obeyed*. (Scene art as an off-by-default toggle at most.)

### Tech & budgets
Hybrid pipeline: canned reaction bank + streamed per-agent TTS + client-side mixing/panning + ambient stem crossfades. Full realtime speech-to-speech is the luxury upgrade later; the hybrid buys ~90% of the presence at a fraction of the cost. Targets: backchannel <400ms · first spoken word <2s · ambient shift <1s. TTS is the marginal-cost driver — meter it per scene alongside tokens before pricing (§13).

### Phase mapping
Table Mode v1 (reaction layer, ambient engine, 2 TTS voices, haptics) lands in **Phase 2 as the centerpiece** — and replaces the thread as the demo-video money shot: 60 seconds of a face-down phone running a live table. Spatial seating + prosody detection in Phase 3.

---

## 10. Architecture & Stack (fit to your setup)

```
┌── PHONE (Expo / React Native) ─────────────────┐
│ Chat UI · hold-to-talk STT · dice tray ·       │
│ push notifications · TestFlight distribution   │
└──────────────┬─────────────────────────────────┘
               │ HTTPS/WSS (stream)
┌──────────────▼─────────────────────────────────┐
│ BACKEND — FastAPI on RackNerd VPS (Phase 1)    │
│  • Orchestrator (Interpreter→TurnMgr→Agents)   │
│  • Rules/Dice service (pure Python, SRD JSON)  │
│  • Director (async task queue)                 │
│  • SQLite per campaign → Postgres at scale     │
│  • Anthropic API (tiered) · dev on Ollama/qwen │
└────────────────────────────────────────────────┘
```

**Stack rationale:** Expo because you're JS-native, it gives push + TestFlight + one codebase, and hold-to-talk/STT are solved modules. FastAPI + SQLite because you've already built exactly this shape (The Soul/Vib). Dev against local qwen to make iteration free; ship on hosted models.

### Model tiering
| Job | Model class | Why |
|---|---|---|
| Interpreter, Turn Manager assist | Haiku-class | High frequency, structured output |
| Player agents | Haiku-class w/ prompt caching | Persona blocks cached; the volume driver |
| Director, reflection pass | Sonnet-class, every N turns | Judgment work, low frequency |
| Report card judge | Sonnet-class, 1×/scene | Rubric grading |

Persona + rules blocks go in cached prefixes; per-turn payload = last K turns + relevant ledger pulls. Target **≤ a few cents per scene**; instrument a real token trace in week one and tune before launch — this number decides the subscription price.

---

## 11. Data Model (core tables)

```
campaign(id, user_id, spine_id, state, created_at)
agent(id, campaign_id, seat, sheet_json, personality_json,
      agenda_json, mood, dm_trust)
ledger(id, campaign_id, scene_id, ts, actor, type,        -- append-only
       content, entity_tags[], witnessed_by[])
scene(id, campaign_id, beat_id, started, ended,
      summary, spotlight_json, pacing_json)
relationship(agent_id, target_type, target_id, valence, notes)
clock(id, campaign_id, name, segments, filled, tick_rules)
report(scene_id, axis_scores_json, drill_suggestion, notes)
npc(campaign_id, name, voice_note, secret, status)         -- DM screen
```

**Memory strategy:** no vector DB at MVP. Context = cached persona + rolling campaign summary + last K turns + tag-matched ledger pulls (Interpreter emits entity tags; recall is a WHERE clause). Add embeddings only if tag recall provably fails.

---

## 12. Legal / IP Hygiene

- Mechanics from **SRD 5.1 (CC-BY-4.0)** — include the required attribution page. (SRD 5.2 is also CC now; 5.1 is sufficient and stable.)
- **Never** use "Dungeons & Dragons," "D&D," "DM" alone is fine, but marketing says **"5E-compatible"**; no WotC trade dress, no Product Identity terms (beholder, mind flayer, Strahd, Forgotten Realms names). All spine content original.
- App Store: disclose AI-generated content, age-gate 13+, content-filter agent outputs (they're your prompts — keep personas PG-13 by construction).

---

## 13. Monetization & Path A Sequence

**Sequence (transaction loop first — same playbook as CARRIER):**
1. **Week 1–2:** Vertical slice (Phase 1 below) → 60–90 sec screen recording: hold-to-talk narration, the thread lighting up, Marcus objecting, report card reveal. The *group chat lighting up* is the whole pitch.
2. **Landing page + Stripe founding link, hard-capped 25 seats** at $49–79 one-time (lifetime founder tier + name on the tavern wall). TestFlight delivery. **First stranger dollar before Phase 2 code.**
3. **Post-validation pricing:** free = 1 drill/day sampler · **$12/mo** ≈ 2 scenes/day budget (priced off the measured per-scene cost with ~70% margin) · scenario packs $5–9 · player packs (new archetypes/voices) $3–5.
4. Distribution: r/DMAcademy, r/solorpgplay, r/DnD "first time DM" threads (a perennial firehose of exactly this fear), DM-tips YouTube sponsorships, FLGS partnerships via the Table Ready cert.

---

## 14. Build Phases

**Phase 1 — The Slice (goal: sellable demo, ~2 weeks at your velocity)**
Expo shell (thread UI, hold-to-talk, text input) · FastAPI orchestrator with Interpreter→TurnMgr→3 agents (Marcus, Pix, Wren) · dice/rules service (checks + basic combat math only) · "The Goblin Toll" spine, beats 1–2 · cold-open scripted scene · report card v1 (spotlight + pacing only, pure telemetry — no judge model yet) · single hard-coded knob preset. **Cut:** TTS, push, leveling, Layer-2 learning, Brannek.

**Phase 2 — The Table Feels Alive**
Full combat mode + initiative rail · Brannek + agenda ignition · Layer-2 social learning + contradiction detector · downtime push texting · **Table Mode v1** (§9.5: reaction layer, ambient engine, 2 TTS voices, haptics) · report card full six axes · personality sliders.

**Phase 3 — The Coach**
Drill library · curriculum scheduler · Table Ready cert · custom seats · second + third spines · spine-authoring format documented (future UGC/marketplace).

**Phase 4 — The Horizon**
Guest seat (a friend joins as 5th player — the bridge from solo practice to real table) · shareable thread highlights (viral loop) · spine marketplace · other systems (the chassis is system-agnostic; swap the rules service).

---

## 15. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Token cost blows up subscriptions | Scene caps, tiering, caching, instrument before pricing; degrade to 2 agents on free tier |
| Latency kills table feel | Streamed interjections mask compose time; WSS; short structured agent outputs |
| Agents feel samey / sycophantic | Personality vectors enforced in system prompts + a "disagreement floor" (Director vetoes scenes where nobody pushed back) |
| Blank-page paralysis anyway | Cold-open inversion + quick-chips + whispers make silence structurally impossible |
| App Store friction (AI content) | PG-13 by construction, disclosure, fallback: PWA beta while review pends |
| WotC trademark | §12 hygiene from day one; original everything |
| It's fun but doesn't *teach* | Every mechanic double-booked as a training instrument (§4, §8); drills are single-axis by design |

---

## 16. Why this wins

The AI-DM market is crowded because it serves *players*. This serves the role the entire hobby is starved for — and the moat is the thing incumbents can't pivot to: their product **is** the DM chair, so they can't hand it to the user without deleting themselves. Meanwhile every mechanic here — spotlight debt, whispers, trust drift, report cards — only makes sense when the human is behind the screen. Small surface, deep loop, phone-native, transaction-first.

*Spec ends. First commit: the Expo shell and the cold open.*
