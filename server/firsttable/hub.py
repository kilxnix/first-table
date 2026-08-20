"""Agent hub: remote workers pick up LLM jobs and post moves back.

The hub is deliberately dumb about the game: the orchestrator/interpreter build
complete LLM requests (system prompt + messages + JSON schema) exactly as they
would for a local provider, and `RemoteProvider` turns each request into a job.
Workers — any process anywhere running `server/worker.py` — long-poll for jobs,
run inference with whatever model they have, and post the raw JSON back. If no
worker is online, jobs delegate to a local fallback provider so the table
never stalls.

Delivery guarantees (single process, in-memory): a claimed job that is never
resolved is re-queued after INFLIGHT_REDELIVER_SECONDS so another worker can
pick it up; jobs whose submitter gave up (zombies) are dropped at claim time;
a job that times out without ever being claimed falls back locally.
"""
import asyncio
import time
import uuid

from .llm import LLMError, LLMProvider

WORKER_FRESH_SECONDS = 55.0          # ~2 poll intervals: a dead worker goes stale fast
JOB_TIMEOUT_SECONDS = 75.0
INFLIGHT_REDELIVER_SECONDS = 30.0    # claimed but unresolved -> back on the queue


class JobTimeout(LLMError):
    """A hub job expired. `claimed` says whether any worker ever picked it up."""

    def __init__(self, message: str, claimed: bool):
        super().__init__(message)
        self.claimed = claimed


class HubQueue:
    """In-process job queue: submit() awaits a worker's resolve()."""

    def __init__(self) -> None:
        self._jobs: asyncio.Queue[dict] = asyncio.Queue()
        self._futures: dict[str, asyncio.Future] = {}
        self._inflight: dict[str, tuple[dict, float]] = {}   # job_id -> (job, claimed_at)
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
        """Queue a job and wait for a worker's result. Raises JobTimeout on
        expiry and LLMError for worker-reported failures."""
        job_id = uuid.uuid4().hex
        future: asyncio.Future = asyncio.get_running_loop().create_future()
        self._futures[job_id] = future
        await self._jobs.put({"job_id": job_id, **payload})
        try:
            return await asyncio.wait_for(future, timeout)
        except asyncio.TimeoutError as exc:
            raise JobTimeout(f"hub job {job_id} timed out after {timeout}s",
                             claimed=job_id in self._inflight) from exc
        finally:
            self._futures.pop(job_id, None)
            self._inflight.pop(job_id, None)

    def _live(self, job_id: str) -> bool:
        future = self._futures.get(job_id)
        return future is not None and not future.done()

    def _requeue_stale_inflight(self) -> None:
        now = time.time()
        for job_id in list(self._inflight):
            job, claimed_at = self._inflight[job_id]
            if not self._live(job_id):
                self._inflight.pop(job_id, None)
            elif now - claimed_at > INFLIGHT_REDELIVER_SECONDS:
                # The claiming worker vanished mid-job; let someone else try.
                self._inflight.pop(job_id, None)
                self._jobs.put_nowait(job)

    async def claim(self, wait: float, worker: str) -> dict | None:
        """Long-poll for the next live job; None if nothing within `wait`.
        Zombie jobs (submitter already gave up) are dropped, not delivered."""
        self.note_worker(worker)
        self._requeue_stale_inflight()
        loop = asyncio.get_running_loop()
        deadline = loop.time() + max(0.0, wait)
        while True:
            remaining = deadline - loop.time()
            if remaining <= 0:
                try:
                    job = self._jobs.get_nowait()
                except asyncio.QueueEmpty:
                    return None
            else:
                try:
                    job = await asyncio.wait_for(self._jobs.get(), remaining)
                except asyncio.TimeoutError:
                    return None
            if self._live(job["job_id"]):
                self._inflight[job["job_id"]] = (job, time.time())
                return job
            # zombie: discard silently and keep waiting out the poll window

    def resolve(self, job_id: str, result: dict | None, error: str | None) -> bool:
        """Deliver a worker's answer. Returns False for unknown/expired jobs."""
        self._inflight.pop(job_id, None)
        future = self._futures.get(job_id)
        if future is None or future.done():
            return False
        if error is not None or result is None:
            future.set_exception(LLMError(f"worker error: {error or 'empty result'}"))
        else:
            future.set_result(result)
        return True


class RemoteProvider(LLMProvider):
    """Routes completions through the hub; falls back locally when no worker is
    online or when a job expires unclaimed (worker looked alive but wasn't).
    Worker-reported failures raise LLMError, which the interpreter and agent
    runner already survive."""

    def __init__(self, queue: HubQueue, fallback: LLMProvider,
                 job_timeout: float = JOB_TIMEOUT_SECONDS):
        self.queue = queue
        self.fallback = fallback
        self.job_timeout = job_timeout

    async def complete_json(self, system: str, messages: list[dict], schema: dict) -> dict:
        if not self.queue.workers_online():
            return await self.fallback.complete_json(system, messages, schema)
        try:
            return await self.queue.submit(
                {"system": system, "messages": messages, "schema": schema},
                timeout=self.job_timeout)
        except JobTimeout as exc:
            if not exc.claimed:
                # Nobody actually picked it up: the "online" worker is gone.
                return await self.fallback.complete_json(system, messages, schema)
            raise


# One queue per server process.
queue = HubQueue()
