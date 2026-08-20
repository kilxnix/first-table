"""Report card v1: spotlight + pacing, pure telemetry (spec section 8).

Tone throughout: corner coach, never schoolmarm.
"""
from .telemetry import SceneTelemetry

DEAD_AIR_SECONDS = 90.0

DRILLS = {
    "spotlight": ("The Silent Player — run one scene where your grade is only "
                  "how well you draw out the quiet seat."),
    "pacing": ("The Derail — practice cutting to the action: end every narration "
               "on a question or a change."),
}


def gini(values: list[float]) -> float:
    """Gini coefficient; 0 for empty input, all-equal, or all-zero values."""
    vals = [float(v) for v in values]
    n = len(vals)
    if n == 0:
        return 0.0
    total = sum(vals)
    if total == 0:
        return 0.0
    mean = total / n
    diff_sum = sum(abs(a - b) for a in vals for b in vals)
    return diff_sum / (2 * n * n * mean)


def build(tel: SceneTelemetry, personas: dict, budget_minutes: int) -> dict:
    """Build the Report shape minus scene_id (the orchestrator adds it)."""
    seats = sorted(personas)

    # --- Spotlight ---
    turns = {seat: len(tel.agent_turns.get(seat, [])) for seat in seats}
    weighted = [turns[seat] / (1 + 0.5 * personas[seat].personality["spotlight_seek"])
                for seat in seats]
    spot = round(100 * (1 - gini(weighted)))
    hesitation_seats = {seat for seat, _ in tel.hesitations}
    if all(seat in tel.hesitations_answered for seat in hesitation_seats):
        spot = min(100, spot + 10)
    if any(n == 0 for n in turns.values()):
        spot = max(0, spot - 15)
    most = max(seats, key=lambda s: turns[s])
    least = min(seats, key=lambda s: turns[s])
    if turns[most] == turns[least]:
        spot_detail = f"Every seat got equal airtime ({turns[most]} turns each)."
    else:
        spot_detail = (f"Most heard: {personas[most].name} ({turns[most]} turns); "
                       f"least heard: {personas[least].name} ({turns[least]} turns).")

    # --- Pacing ---
    events = sorted(tel.dm_turns + [ts for lst in tel.agent_turns.values() for ts in lst])
    gaps = sum(1 for a, b in zip(events, events[1:]) if b - a > DEAD_AIR_SECONDS)
    length_seconds = (events[-1] - tel.started) if events else 0.0
    pace = 100 - 8 * gaps
    if length_seconds > budget_minutes * 60:
        pace -= 15
    if len(tel.dm_turns) < 3:
        pace -= 20
    pace = max(0, pace)
    minutes = length_seconds / 60
    pace_detail = (f"Scene ran {minutes:.1f} min with {gaps} dead-air "
                   f"gap{'s' if gaps != 1 else ''}.")

    # --- Drill: lowest axis wins, tie goes to spotlight ---
    drill_axis = "spotlight" if spot <= pace else "pacing"

    # --- Corner-coach notes, one per axis ---
    if spot >= 85:
        spot_note = (f"Good ear — the whole table got airtime. "
                     f"Keep half an eye on {personas[least].name}.")
    else:
        spot_note = (f"{personas[most].name} ran away with the mic. Toss "
                     f"{personas[least].name} one direct question early next scene.")
    if pace >= 85:
        pace_note = "Snappy scene — you kept the table moving. Keep that rhythm."
    else:
        pace_note = ("When the table stalls, cut to a question or a change — "
                     "dead air is yours to break.")

    return {
        "axes": {
            "spotlight": {"score": spot, "detail": spot_detail},
            "pacing": {"score": pace, "detail": pace_detail},
        },
        "drill_suggestion": DRILLS[drill_axis],
        "notes": [spot_note, pace_note],
    }
