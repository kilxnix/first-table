"""FastAPI app: locked REST + one WebSocket per campaign + the agent hub."""
import logging
import secrets

from fastapi import FastAPI, Header, HTTPException, Query, Response, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from . import hub, protocol
from .config import load_config
from .db import Store
from .llm import get_provider
from .orchestrator import Table

logger = logging.getLogger("firsttable")

cfg = load_config()
store = Store(cfg.db_path)
provider = get_provider(cfg)

# Worker endpoints always require a bearer token; generate one if unset so a
# publicly tunneled hub is never open to arbitrary move injection.
hub_token = cfg.hub_token or secrets.token_urlsafe(16)
if cfg.hub_token is None:
    logger.warning("FIRSTTABLE_HUB_TOKEN not set - generated worker token: %s", hub_token)

app = FastAPI(title="First Table")
app.add_middleware(CORSMiddleware, allow_origins=["*"],
                   allow_methods=["*"], allow_headers=["*"])

tables: dict[int, Table] = {}


def get_table(cid: int) -> Table:
    if cid not in tables:
        if store.get_campaign(cid) is None:
            raise HTTPException(status_code=404, detail="campaign not found")
        tables[cid] = Table(cid, store, provider, cfg)
    return tables[cid]


class ConnectionManager:
    def __init__(self):
        self._sockets: dict[int, list[WebSocket]] = {}

    async def connect(self, cid: int, ws: WebSocket) -> None:
        await ws.accept()
        self._sockets.setdefault(cid, []).append(ws)

    def disconnect(self, cid: int, ws: WebSocket) -> None:
        sockets = self._sockets.get(cid, [])
        if ws in sockets:
            sockets.remove(ws)

    async def broadcast(self, cid: int, frame: dict) -> None:
        for ws in list(self._sockets.get(cid, [])):
            try:
                await ws.send_json(frame)
            except Exception:
                self.disconnect(cid, ws)


manager = ConnectionManager()


def broadcaster(cid: int):
    async def emit(frame: dict) -> None:
        await manager.broadcast(cid, frame)
    return emit


# -- REST ----------------------------------------------------------------------

class CreateCampaignBody(BaseModel):
    name: str | None = None


@app.post("/api/campaigns", response_model=protocol.CampaignState)
def create_campaign(body: CreateCampaignBody | None = None):
    name = (body.name if body and body.name else "The Goblin Toll")
    cid = store.create_campaign(name, "goblin_toll")
    return get_table(cid).campaign_state()


@app.get("/api/campaigns")
def list_campaigns():
    return store.list_campaigns()


@app.get("/api/campaigns/{cid}", response_model=protocol.CampaignState)
def get_campaign(cid: int):
    return get_table(cid).campaign_state()


@app.post("/api/campaigns/{cid}/scenes")
async def start_scene(cid: int):
    table = get_table(cid)
    scene_id = await table.start_scene(broadcaster(cid))
    return {"scene_id": scene_id}


@app.post("/api/campaigns/{cid}/scenes/end")
async def end_scene(cid: int):
    table = get_table(cid)
    try:
        report = await table.end_scene(broadcaster(cid))
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return {"report": report}


# -- Agent hub (remote workers) ------------------------------------------------

def _check_worker_auth(authorization: str | None) -> None:
    expected = f"Bearer {hub_token}"
    if not authorization or not secrets.compare_digest(authorization, expected):
        raise HTTPException(status_code=401, detail="bad or missing hub token")


class JobResultBody(BaseModel):
    result: dict | None = None
    error: str | None = None


@app.get("/api/hub/jobs")
async def claim_job(
    wait: float = Query(default=25.0, ge=0.0, le=30.0),
    authorization: str | None = Header(default=None),
    x_worker_name: str = Header(default="worker"),
):
    _check_worker_auth(authorization)
    job = await hub.queue.claim(wait, x_worker_name)
    if job is None:
        return Response(status_code=204)
    return job


@app.post("/api/hub/jobs/{job_id}")
async def submit_job(
    job_id: str,
    body: JobResultBody,
    authorization: str | None = Header(default=None),
    x_worker_name: str = Header(default="worker"),
):
    _check_worker_auth(authorization)
    hub.queue.note_worker(x_worker_name)
    if not hub.queue.resolve(job_id, body.result, body.error):
        raise HTTPException(status_code=404, detail="unknown or expired job")
    return {"ok": True}


@app.get("/api/hub/status")
def hub_status():
    return {"provider": cfg.provider,
            "workers_online": hub.queue.workers_online(),
            "pending_jobs": hub.queue.pending()}


# -- WebSocket -------------------------------------------------------------------

@app.websocket("/ws/{cid}")
async def websocket_table(ws: WebSocket, cid: int):
    if store.get_campaign(cid) is None:
        await ws.accept()
        await ws.send_json({"type": "error", "detail": "campaign not found"})
        await ws.close()
        return
    await manager.connect(cid, ws)
    table = get_table(cid)
    emit = broadcaster(cid)
    try:
        await ws.send_json({"type": "hello", "campaign": table.campaign_state()})
        while True:
            data = await ws.receive_json()
            kind = data.get("type")
            if kind == "dm_input":
                await table.handle_dm_input(data.get("text", ""),
                                            data.get("mode", "text"), emit)
            elif kind == "roll":
                await table.manual_roll(data.get("formula", ""),
                                        data.get("label", "Table roll"), emit)
            else:
                await ws.send_json({"type": "error",
                                    "detail": f"unknown frame type: {kind!r}"})
    except WebSocketDisconnect:
        pass
    finally:
        manager.disconnect(cid, ws)
