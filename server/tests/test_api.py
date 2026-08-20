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
