import json
import sqlite3
import threading
import time
from datetime import datetime, timezone

_SCHEMA = """
CREATE TABLE IF NOT EXISTS campaign (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    spine_id TEXT NOT NULL,
    state_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS scene (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    campaign_id INTEGER NOT NULL,
    beat_id TEXT NOT NULL,
    started REAL NOT NULL,
    ended REAL,
    report_json TEXT
);
CREATE TABLE IF NOT EXISTS message (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    campaign_id INTEGER NOT NULL,
    scene_id INTEGER,
    ts REAL NOT NULL,
    payload_json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS ledger (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    campaign_id INTEGER NOT NULL,
    scene_id INTEGER,
    ts REAL NOT NULL,
    actor TEXT NOT NULL,
    type TEXT NOT NULL,
    content TEXT NOT NULL,
    entity_tags TEXT NOT NULL DEFAULT '[]'
);
"""


class Store:
    def __init__(self, path: str):
        self._conn = sqlite3.connect(path, check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        self._lock = threading.Lock()
        self._init_schema()

    def _init_schema(self) -> None:
        with self._lock:
            self._conn.executescript(_SCHEMA)
            self._conn.commit()

    def close(self) -> None:
        self._conn.close()

    # -- campaigns -----------------------------------------------------------

    def create_campaign(self, name: str, spine_id: str) -> int:
        created = datetime.now(timezone.utc).isoformat()
        with self._lock:
            cur = self._conn.execute(
                "INSERT INTO campaign (name, spine_id, state_json, created_at) VALUES (?, ?, '{}', ?)",
                (name, spine_id, created),
            )
            self._conn.commit()
            return cur.lastrowid

    def list_campaigns(self) -> list[dict]:
        rows = self._conn.execute(
            "SELECT id, name, created_at FROM campaign ORDER BY id"
        ).fetchall()
        return [dict(r) for r in rows]

    def get_campaign(self, cid: int) -> dict | None:
        row = self._conn.execute(
            "SELECT id, name, spine_id, state_json, created_at FROM campaign WHERE id = ?",
            (cid,),
        ).fetchone()
        if row is None:
            return None
        d = dict(row)
        d["state"] = json.loads(d.pop("state_json"))
        return d

    def save_state(self, cid: int, state: dict) -> None:
        with self._lock:
            self._conn.execute(
                "UPDATE campaign SET state_json = ? WHERE id = ?",
                (json.dumps(state), cid),
            )
            self._conn.commit()

    # -- scenes --------------------------------------------------------------

    def start_scene(self, cid: int, beat_id: str) -> int:
        with self._lock:
            cur = self._conn.execute(
                "INSERT INTO scene (campaign_id, beat_id, started) VALUES (?, ?, ?)",
                (cid, beat_id, time.time()),
            )
            self._conn.commit()
            return cur.lastrowid

    def end_scene(self, scene_id: int, report: dict) -> None:
        with self._lock:
            self._conn.execute(
                "UPDATE scene SET ended = ?, report_json = ? WHERE id = ?",
                (time.time(), json.dumps(report), scene_id),
            )
            self._conn.commit()

    def active_scene(self, cid: int) -> dict | None:
        row = self._conn.execute(
            "SELECT id, beat_id, started FROM scene "
            "WHERE campaign_id = ? AND ended IS NULL ORDER BY id DESC LIMIT 1",
            (cid,),
        ).fetchone()
        return dict(row) if row is not None else None

    # -- thread --------------------------------------------------------------

    def append_message(self, cid: int, scene_id: int | None, msg: dict) -> int:
        with self._lock:
            cur = self._conn.execute(
                "INSERT INTO message (campaign_id, scene_id, ts, payload_json) VALUES (?, ?, ?, ?)",
                (cid, scene_id, msg.get("ts", time.time()), json.dumps(msg)),
            )
            self._conn.commit()
            return cur.lastrowid

    def thread(self, cid: int, limit: int = 200) -> list[dict]:
        rows = self._conn.execute(
            "SELECT id, ts, payload_json FROM message "
            "WHERE campaign_id = ? ORDER BY id DESC LIMIT ?",
            (cid, limit),
        ).fetchall()
        out = []
        for r in reversed(rows):
            msg = json.loads(r["payload_json"])
            msg["id"] = r["id"]
            msg.setdefault("ts", r["ts"])
            out.append(msg)
        return out

    # -- ledger ---------------------------------------------------------------

    def append_ledger(self, cid: int, scene_id: int | None, actor: str, type: str,
                      content: str, entity_tags: list[str]) -> None:
        with self._lock:
            self._conn.execute(
                "INSERT INTO ledger (campaign_id, scene_id, ts, actor, type, content, entity_tags) "
                "VALUES (?, ?, ?, ?, ?, ?, ?)",
                (cid, scene_id, time.time(), actor, type, content, json.dumps(entity_tags)),
            )
            self._conn.commit()
