"""Orchestrator: one Table per campaign, driving the spec section 6 pipeline.

Pipeline per DM input: Interpreter -> Director -> Turn Manager -> Agent Runner
-> Rules/Dice -> Telemetry. All frames go out through an `emit` callable so
the same Table serves both the WebSocket and REST-triggered broadcasts.
"""
import asyncio
import logging
import random
import time

from . import director, interpreter, protocol, report_card, rules
from .agent_runner import _render_message, run_agent
from .config import Config
from .db import Store
from .dice import DiceError, roll
from .personas import load_personas
from .spine import load_spine
from .telemetry import SceneTelemetry
from .turn_manager import SpotlightState
from .turn_manager import plan as plan_turn

COLD_OPEN_DELAY = 0.6
TAIL = 12

logger = logging.getLogger("firsttable")


def _default_state() -> dict:
    return {"beat_index": 0, "dm_turn_count": 0, "fired_whispers": [],
            "clock_fill": {}, "npc_hp": {}, "pending_whispers": {},
            "awaiting_hesitation": None, "cold_open_done": False,
            "spotlight": {}, "telemetry": None}


class Table:
    """One live table per campaign; serializes DM inputs behind a lock."""

    def __init__(self, cid: int, store: Store, provider, cfg: Config):
        self.cid = cid
        self.store = store
        self.provider = provider
        self.cfg = cfg
        campaign = store.get_campaign(cid)
        if campaign is None:
            raise ValueError(f"no campaign with id {cid}")
        self.spine = load_spine(campaign["spine_id"])
        self.personas = load_personas()
        self.state = _default_state()
        self.state.update(campaign["state"] or {})
        seats = sorted(self.personas)
        self.spotlight = (SpotlightState.from_dict(self.state["spotlight"])
                          if self.state["spotlight"] else SpotlightState(seats))
        self.telemetry = (SceneTelemetry.from_dict(self.state["telemetry"])
                          if self.state["telemetry"] else SceneTelemetry())
        self.rng = random.Random(cfg.seed) if cfg.seed is not None else random.Random()
        self._lock = asyncio.Lock()
        active = store.active_scene(cid)
        self.scene_id = active["id"] if active else None

    # -- helpers ---------------------------------------------------------------

    def _active_beat(self):
        index = min(self.state["beat_index"], len(self.spine.beats) - 1)
        return self.spine.beats[index]

    def _dm_screen(self) -> dict:
        return director.dm_screen_state(self.spine, self.state, self.personas)

    def _persist_state(self) -> None:
        self.state["spotlight"] = self.spotlight.to_dict()
        self.state["telemetry"] = self.telemetry.to_dict()
        self.store.save_state(self.cid, self.state)

    async def _send_message(self, emit, msg: dict) -> dict:
        payload = {k: v for k, v in msg.items() if k != "id"}
        msg["id"] = self.store.append_message(self.cid, self.scene_id, payload)
        await emit({"type": "message", "message": msg})
        return msg

    def _thread_tail(self) -> list[dict]:
        return self.store.thread(self.cid)[-TAIL:]

    async def _resolve_and_emit_roll(self, emit, persona, req: dict) -> None:
        try:
            res = rules.resolve_roll_request(persona.sheet, req, self.spine.npcs, self.rng)
        except (rules.RulesError, DiceError) as exc:
            # A bad LLM roll request must not kill the turn, but it must not
            # vanish without a trace either.
            logger.warning("dropped unresolvable roll_request %r from %s: %s",
                           req, persona.name, exc)
            return
        view = {"formula": res["formula"], "rolls": res["rolls"],
                "modifier": res["modifier"], "total": res["total"],
                "label": res["label"], "actor": persona.name,
                "outcome": res.get("outcome")}
        await self._send_message(emit, protocol.roll_message(0, time.time(), view))

    async def _speak(self, emit, seat: str, mode: str) -> None:
        persona = self.personas[seat]
        await emit({"type": "typing", "seat": seat, "name": persona.name})
        pending = self.state["pending_whispers"].pop(seat, [])
        whisper = "\n".join(pending) if pending else None
        reply = await run_agent(self.provider, persona, mode, self._thread_tail(), whisper)
        if reply.pop("_fallback", False) and pending:
            # The LLM call failed, so the whisper was never actually delivered;
            # put it back so it reaches the agent on their next turn instead of
            # being destroyed (fired_whispers means it can never re-fire).
            self.state["pending_whispers"].setdefault(seat, [])[0:0] = pending
        await emit({"type": "typing_stop", "seat": seat})
        ts = time.time()
        await self._send_message(emit, protocol.agent_message(0, ts, seat, persona.name, reply))
        self.telemetry.record_agent(seat, ts)
        self.spotlight.clear(seat)
        self.store.append_ledger(self.cid, self.scene_id, seat, "agent_reply",
                                 reply.get("speech") or reply.get("action") or "", [])
        if reply.get("roll_request"):
            await self._resolve_and_emit_roll(emit, persona, reply["roll_request"])

    # -- scene lifecycle ---------------------------------------------------------

    async def start_scene(self, emit) -> int:
        async with self._lock:
            existing = self.store.active_scene(self.cid)
            if existing:
                return existing["id"]
            beat = self._active_beat()
            self.scene_id = self.store.start_scene(self.cid, beat.id)
            self.telemetry = SceneTelemetry(started=time.time())
            await emit({"type": "scene", "status": "started",
                        "scene_id": self.scene_id, "report": None})
            if not self.state["cold_open_done"]:
                # Mark and persist BEFORE playing the lines: a crash mid-cold-open
                # must degrade to skipped lines, never to a full replay of the
                # opener in a later scene.
                self.state["cold_open_done"] = True
                self._persist_state()
                for entry in self.spine.cold_open:
                    seat = entry["seat"]
                    persona = self.personas[seat]
                    await emit({"type": "typing", "seat": seat, "name": persona.name})
                    await asyncio.sleep(COLD_OPEN_DELAY)
                    ts = time.time()
                    reply = {"speech": entry.get("speech", ""),
                             "action": entry.get("action", ""),
                             "ooc": entry.get("ooc", ""), "roll_request": None}
                    await self._send_message(
                        emit, protocol.agent_message(0, ts, seat, persona.name, reply))
                    await emit({"type": "typing_stop", "seat": seat})
                    self.telemetry.record_agent(seat, ts)
            else:
                await self._send_message(
                    emit, protocol.system_message(
                        0, time.time(), f"The table settles. [Beat: {beat.title}]"))
            self._persist_state()
            await emit({"type": "dm_screen", "dm_screen": self._dm_screen()})
            return self.scene_id

    async def handle_dm_input(self, text: str, mode: str, emit) -> None:
        async with self._lock:
            # 1. Persist + emit the DM message; telemetry; ledger.
            ts = time.time()
            await self._send_message(emit, protocol.dm_message(0, ts, text))
            self.telemetry.record_dm(ts)
            self.store.append_ledger(self.cid, self.scene_id, "dm", "dm_input", text, [])

            # 2. Interpret.
            recent = [_render_message(m) for m in self.store.thread(self.cid)[-6:]]
            interp = await interpreter.interpret(self.provider, text, self.personas, recent)

            # 3. Director: whispers, beat advance.
            events = director.on_dm_turn(self.spine, self.state, interp)
            if events.beat_changed or events.whispers_fired:
                self._persist_state()
            if events.beat_changed:
                new_title = self._active_beat().title
                await self._send_message(
                    emit, protocol.system_message(0, time.time(), f"[Beat: {new_title}]"))
                await emit({"type": "dm_screen", "dm_screen": self._dm_screen()})

            # 4. Hesitation answered check (before planning).
            waiting = self.state.get("awaiting_hesitation")
            if waiting and waiting in interp["addressed_seats"]:
                self.telemetry.record_hesitation_answered(waiting)
                self.state["awaiting_hesitation"] = None

            # 5. Plan the turn.
            turn_plan = plan_turn(interp, self.personas, self.spotlight, self.rng)

            # 6/7. Speakers (group checks roll for every addressed seat first).
            spoke: list[str] = []
            if interp["intent"] == "group_check":
                skill = interp["skill"] or "perception"
                for seat in interp["addressed_seats"]:
                    await self._resolve_and_emit_roll(
                        emit, self.personas[seat], {"kind": "check", "skill": skill})
                await self._speak(emit, turn_plan.main, "main")
                spoke.append(turn_plan.main)
            else:
                for seat in turn_plan.interjectors:
                    await self._speak(emit, seat, "interject")
                    spoke.append(seat)
                await self._speak(emit, turn_plan.main, "main")
                spoke.append(turn_plan.main)

            # 8. Accrue spotlight debt for the silent seats.
            silent = [s for s in sorted(self.personas) if s not in spoke]
            self.spotlight.accrue(silent)

            # 9. Hesitation beat (does not clear spotlight debt).
            if turn_plan.hesitation:
                seat = turn_plan.hesitation
                persona = self.personas[seat]
                await emit({"type": "typing", "seat": seat, "name": persona.name})
                reply = await run_agent(self.provider, persona, "hesitate",
                                        self._thread_tail(), None)
                await emit({"type": "typing_stop", "seat": seat})
                hts = time.time()
                await self._send_message(
                    emit, protocol.agent_message(0, hts, seat, persona.name, reply))
                self.telemetry.record_hesitation(seat, hts)
                self.state["awaiting_hesitation"] = seat

            # 10. Persist everything.
            self._persist_state()

    async def manual_roll(self, formula: str, label: str, emit) -> None:
        async with self._lock:
            try:
                r = roll(formula, self.rng)
            except DiceError as exc:
                await emit({"type": "error", "detail": str(exc)})
                return
            view = {"formula": r.formula, "rolls": r.rolls, "modifier": r.modifier,
                    "total": r.total, "label": label, "actor": "DM", "outcome": None}
            await self._send_message(emit, protocol.roll_message(0, time.time(), view))

    async def end_scene(self, emit) -> dict:
        async with self._lock:
            active = self.store.active_scene(self.cid)
            if active is None:
                raise ValueError("no active scene")
            sid = active["id"]
            director.on_scene_end(self.spine, self.state)
            report = report_card.build(self.telemetry, self.personas,
                                       self._active_beat().pressure_budget_minutes)
            report["scene_id"] = sid
            self.store.end_scene(sid, report)
            self.scene_id = None
            await emit({"type": "dm_screen", "dm_screen": self._dm_screen()})
            await emit({"type": "scene", "status": "ended", "scene_id": sid,
                        "report": report})
            self.telemetry = SceneTelemetry()
            self.spotlight = SpotlightState(sorted(self.personas))
            # An unanswered hesitation dies with its scene; carrying the flag
            # over would credit next scene's report for answering it.
            self.state["awaiting_hesitation"] = None
            self._persist_state()
            return report

    # -- snapshots ---------------------------------------------------------------

    def campaign_state(self) -> dict:
        campaign = self.store.get_campaign(self.cid)
        active = self.store.active_scene(self.cid)
        party = []
        for seat in sorted(self.personas):
            p = self.personas[seat]
            party.append({"seat": seat, "name": p.name, "char_class": p.char_class,
                          "ancestry": p.ancestry, "level": p.sheet["level"],
                          "hp": p.sheet["hp"], "max_hp": p.sheet["max_hp"],
                          "ac": p.sheet["ac"],
                          "mood": self.state.get("moods", {}).get(seat, "steady"),
                          "portrait": p.portrait, "stats": p.sheet["stats"],
                          "inventory": list(p.sheet.get("inventory", []))})
        return {"id": campaign["id"], "name": campaign["name"],
                "scene_active": active is not None,
                "scene_id": active["id"] if active else None,
                "party": party,
                "thread": self.store.thread(self.cid),
                "dm_screen": self._dm_screen()}
