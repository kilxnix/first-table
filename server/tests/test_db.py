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
