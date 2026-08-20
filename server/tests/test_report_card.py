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
