"""FastAPI app: locked REST + one WebSocket per campaign."""
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from . import protocol
from .config import load_config
from .db import Store
from .llm import get_provider
from .orchestrator import Table

cfg = load_config()
store = Store(cfg.db_path)
provider = get_provider(cfg)

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
