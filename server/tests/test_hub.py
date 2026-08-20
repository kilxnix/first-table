import asyncio
import importlib

import pytest

from firsttable.config import Config
from firsttable.hub import HubQueue, RemoteProvider
from firsttable.llm import LLMError, MockProvider, get_provider

SCHEMA = {"type": "object", "properties": {"speech": {"type": "string"}}}


def test_get_provider_builds_hub_with_fallback():
    p = get_provider(Config(provider="hub", hub_fallback="mock"))
    assert isinstance(p, RemoteProvider) and isinstance(p.fallback, MockProvider)
    with pytest.raises(LLMError):
        get_provider(Config(provider="hub", hub_fallback="hub"))


def test_no_worker_uses_fallback():
    q = HubQueue()
    p = RemoteProvider(q, MockProvider())
    out = asyncio.run(p.complete_json("You are Pix...", [], SCHEMA))
    assert out["speech"]
    assert q.pending() == 0          # nothing was queued


def test_worker_roundtrip():
    async def scenario():
        q = HubQueue()
        p = RemoteProvider(q, MockProvider())
        q.note_worker("w1")

        async def worker():
            job = await q.claim(wait=5.0, worker="w1")
            assert job["system"].startswith("You are")
            assert q.resolve(job["job_id"], {"speech": "from the hub"}, None)

        w = asyncio.create_task(worker())
        out = await p.complete_json("You are Marcus...", [], SCHEMA)
        await w
        return out

    assert asyncio.run(scenario())["speech"] == "from the hub"


def test_worker_error_raises_llmerror():
    async def scenario():
        q = HubQueue()
        p = RemoteProvider(q, MockProvider())
        q.note_worker("w1")

        async def worker():
            job = await q.claim(wait=5.0, worker="w1")
            q.resolve(job["job_id"], None, "model exploded")

        asyncio.create_task(worker())
        with pytest.raises(LLMError):
            await p.complete_json("sys", [], SCHEMA)

    asyncio.run(scenario())


def test_job_timeout_raises_llmerror():
    async def scenario():
        q = HubQueue()
        q.note_worker("w1")               # online but never claims
        p = RemoteProvider(q, MockProvider())
        with pytest.raises(LLMError):
            await q.submit({"system": "s", "messages": [], "schema": {}}, timeout=0.05)
        assert p is not None

    asyncio.run(scenario())


def test_resolve_unknown_job_is_false():
    q = HubQueue()
    assert q.resolve("nope", {"a": 1}, None) is False


def test_workers_go_stale(monkeypatch):
    q = HubQueue()
    q.note_worker("w1")
    assert q.workers_online() == ["w1"]
    import firsttable.hub as hub_mod
    monkeypatch.setattr(hub_mod.time, "time", lambda: 10_000_000_000.0)
    assert q.workers_online() == []


def _client(monkeypatch, provider="hub"):
    monkeypatch.setenv("FIRSTTABLE_PROVIDER", provider)
    monkeypatch.setenv("FIRSTTABLE_HUB_FALLBACK", "mock")
    monkeypatch.setenv("FIRSTTABLE_HUB_TOKEN", "test-token")
    monkeypatch.setenv("FIRSTTABLE_DB", ":memory:")
    monkeypatch.setenv("FIRSTTABLE_SEED", "7")
    import firsttable.hub
    importlib.reload(firsttable.hub)
    import firsttable.main as m
    importlib.reload(m)
    from fastapi.testclient import TestClient
    return TestClient(m.app)


def test_endpoints_require_token(monkeypatch):
    c = _client(monkeypatch)
    assert c.get("/api/hub/jobs", params={"wait": 0}).status_code == 401
    assert c.post("/api/hub/jobs/x", json={"result": {}}).status_code == 401
    assert c.get("/api/hub/status").json()["workers_online"] == []


def test_claim_empty_then_submit_unknown(monkeypatch):
    c = _client(monkeypatch)
    auth = {"Authorization": "Bearer test-token", "X-Worker-Name": "w1"}
    assert c.get("/api/hub/jobs", params={"wait": 0}, headers=auth).status_code == 204
    assert c.post("/api/hub/jobs/nope", json={"result": {}}, headers=auth).status_code == 404
    assert "w1" in c.get("/api/hub/status").json()["workers_online"]


def test_table_works_via_hub_fallback_when_no_workers(monkeypatch):
    c = _client(monkeypatch)
    cid = c.post("/api/campaigns", json={"name": "Hub demo"}).json()["id"]
    assert c.post(f"/api/campaigns/{cid}/scenes", json={}).status_code == 200
    with c.websocket_connect(f"/ws/{cid}") as ws:
        hello = ws.receive_json()
        assert hello["type"] == "hello"
        ws.send_json({"type": "dm_input", "text": "Marcus, the keeper stares.", "mode": "text"})
        got_agent = False
        for _ in range(30):
            f = ws.receive_json()
            if f["type"] == "message" and f["message"]["kind"] == "agent":
                got_agent = True
                break
        assert got_agent


def test_zombie_jobs_dropped_at_claim():
    async def scenario():
        q = HubQueue()
        q.note_worker("w1")
        with pytest.raises(LLMError):
            await q.submit({"system": "s", "messages": [], "schema": {}}, timeout=0.01)
        assert q.pending() == 1              # orphan still queued...
        assert await q.claim(wait=0.0, worker="w1") is None   # ...but never delivered
        assert q.pending() == 0

    asyncio.run(scenario())


def test_lost_claim_is_redelivered():
    async def scenario():
        q = HubQueue()
        q.note_worker("w1")

        async def flow():
            job = await q.claim(wait=2.0, worker="w1")
            # worker "dies": simulate the redelivery window elapsing
            jid = job["job_id"]
            j, ts = q._inflight[jid]
            q._inflight[jid] = (j, ts - 999)
            job2 = await q.claim(wait=2.0, worker="w2")
            assert job2 is not None and job2["job_id"] == jid
            q.resolve(jid, {"speech": "second worker saves it"}, None)

        w = asyncio.create_task(flow())
        out = await q.submit({"system": "s", "messages": [], "schema": {}}, timeout=5.0)
        await w
        return out

    assert asyncio.run(scenario())["speech"] == "second worker saves it"


def test_unclaimed_timeout_falls_back():
    async def scenario():
        q = HubQueue()
        q.note_worker("ghost")               # looks online, never claims
        p = RemoteProvider(q, MockProvider(), job_timeout=0.05)
        out = await p.complete_json("You are Pix...", [], SCHEMA)
        assert out["speech"]                 # fallback answered

    asyncio.run(scenario())


def test_claimed_timeout_still_raises():
    async def scenario():
        q = HubQueue()
        q.note_worker("w1")
        p = RemoteProvider(q, MockProvider(), job_timeout=0.3)

        async def slow_worker():
            await q.claim(wait=2.0, worker="w1")
            await asyncio.sleep(1.0)         # never resolves in time

        asyncio.create_task(slow_worker())
        with pytest.raises(LLMError):
            await p.complete_json("sys", [], SCHEMA)

    asyncio.run(scenario())


def test_worker_run_job_survives_any_exception():
    import sys
    sys.path.insert(0, str(__import__("pathlib").Path(__file__).parent.parent))
    from worker import run_job

    class Chaotic:
        async def complete_json(self, *a, **k):
            raise KeyError("message")

    body = asyncio.run(run_job(Chaotic(), {"system": "s", "messages": [], "schema": {}}))
    assert body["error"].startswith("KeyError")
