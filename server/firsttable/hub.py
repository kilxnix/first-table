"""Agent hub: remote workers pick up LLM jobs and post moves back.

The hub is deliberately dumb about the game: the orchestrator/interpreter build
complete LLM requests (system prompt + messages + JSON schema) exactly as they
would for a local provider, and `RemoteProvider` turns each request into a job.
Workers — any process anywhere running `server/worker.py` — long-poll for jobs,
run inference with whatever model they have, and post the raw JSON back. If no
worker is online, jobs delegate to a local fallback provider so the table
never stalls.
"""
import asyncio
import time
import uuid

from .llm import LLMError, LLMProvider

WORKER_FRESH_SECONDS = 90.0
JOB_TIMEOUT_SECONDS = 75.0


class HubQueue:
    """In-process job queue: submit() awaits a worker's resolve()."""

    def __init__(self) -> None:
        self._jobs: asyncio.Queue[dict] = asyncio.Queue()
        self._futures: dict[str, asyncio.Future] = {}
        self._worker_seen: dict[str, float] = {}

    # -- worker presence ---------------------------------------------------------

    def note_worker(self, name: str) -> None:
        self._worker_seen[name] = time.time()

    def workers_online(self) -> list[str]:
        cutoff = time.time() - WORKER_FRESH_SECONDS
        return sorted(n for n, ts in self._worker_seen.items() if ts >= cutoff)

    def pending(self) -> int:
        return self._jobs.qsize()

    # -- job lifecycle -----------------------------------------------------------

    async def submit(self, payload: dict, timeout: float = JOB_TIMEOUT_SECONDS) -> dict:
        """Queue a job and wait for a worker's result. Raises LLMError on
        timeout or a worker-reported error."""
        job_id = uuid.uuid4().hex
        future: asyncio.Future = asyncio.get_running_loop().create_future()
        self._futures[job_id] = future
        await self._jobs.put({"job_id": job_id, **payload})
        try:
            return await asyncio.wait_for(future, timeout)
        except asyncio.TimeoutError as exc:
            raise LLMError(f"hub job {job_id} timed out after {timeout}s") from exc
        finally:
            self._futures.pop(job_id, None)

    async def claim(self, wait: float, worker: str) -> dict | None:
        """Long-poll for the next job; None if nothing arrives within `wait`."""
        self.note_worker(worker)
        try:
            return await asyncio.wait_for(self._jobs.get(), max(0.0, wait))
        except asyncio.TimeoutError:
            return None

    def resolve(self, job_id: str, result: dict | None, error: str | None) -> bool:
        """Deliver a worker's answer. Returns False for unknown/expired jobs."""
        future = self._futures.get(job_id)
        if future is None or future.done():
            return False
        if error is not None or result is None:
            future.set_exception(LLMError(f"worker error: {error or 'empty result'}"))
        else:
            future.set_result(result)
        return True


class RemoteProvider(LLMProvider):
    """Routes completions through the hub; falls back locally when no worker
    is online. Worker failures raise LLMError, which the interpreter and agent
    runner already survive."""

    def __init__(self, queue: HubQueue, fallback: LLMProvider):
        self.queue = queue
        self.fallback = fallback

    async def complete_json(self, system: str, messages: list[dict], schema: dict) -> dict:
        if not self.queue.workers_online():
            return await self.fallback.complete_json(system, messages, schema)
        return await self.queue.submit(
            {"system": system, "messages": messages, "schema": schema})


# One queue per server process.
queue = HubQueue()
