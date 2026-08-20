"""First Table agent worker: connects OUT to a hub, runs inference, posts moves.

Run this anywhere that has Python + an LLM (local Ollama, an Anthropic key, or
the deterministic mock). The device hosting the table never needs the model.

    FIRSTTABLE_HUB_URL=https://your-hub.example FIRSTTABLE_HUB_TOKEN=... \
    FIRSTTABLE_WORKER_PROVIDER=ollama python worker.py
"""
import asyncio
import logging
import os
import platform

import httpx

from firsttable.config import load_config
from firsttable.llm import LLMError, get_provider

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s")
logger = logging.getLogger("worker")

POLL_WAIT = 25.0


async def run_job(provider, job: dict) -> dict:
    """Execute one hub job; returns the body to POST back."""
    try:
        result = await provider.complete_json(
            job.get("system", ""), job.get("messages", []), job.get("schema", {}))
        return {"result": result}
    except LLMError as exc:
        return {"error": str(exc)}


async def main() -> None:
    hub_url = os.environ.get("FIRSTTABLE_HUB_URL", "http://localhost:8000").rstrip("/")
    token = os.environ.get("FIRSTTABLE_HUB_TOKEN", "")
    name = os.environ.get("FIRSTTABLE_WORKER_NAME", platform.node() or "worker")

    cfg = load_config()
    cfg.provider = os.environ.get("FIRSTTABLE_WORKER_PROVIDER", "ollama")
    if cfg.provider == "hub":
        raise SystemExit("a worker cannot use the 'hub' provider")
    provider = get_provider(cfg)

    headers = {"Authorization": f"Bearer {token}", "X-Worker-Name": name}
    logger.info("worker %r serving hub %s with provider %r", name, hub_url, cfg.provider)

    async with httpx.AsyncClient(timeout=POLL_WAIT + 20) as client:
        while True:
            try:
                res = await client.get(f"{hub_url}/api/hub/jobs",
                                       params={"wait": POLL_WAIT}, headers=headers)
                if res.status_code == 204:
                    continue
                if res.status_code == 401:
                    raise SystemExit("hub rejected the token (FIRSTTABLE_HUB_TOKEN)")
                res.raise_for_status()
                job = res.json()
                logger.info("job %s claimed", job["job_id"])
                body = await run_job(provider, job)
                post = await client.post(f"{hub_url}/api/hub/jobs/{job['job_id']}",
                                         json=body, headers=headers)
                logger.info("job %s -> %s (%s)", job["job_id"], post.status_code,
                            "error" if body.get("error") else "ok")
            except (httpx.HTTPError, KeyError, ValueError) as exc:
                logger.warning("hub unreachable or bad response (%s); retrying in 5s", exc)
                await asyncio.sleep(5)


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
