import os
from dataclasses import dataclass


@dataclass
class Config:
    provider: str = "mock"          # mock | ollama | anthropic | hub
    ollama_model: str = "qwen3.5:9b"
    ollama_url: str = "http://localhost:11434"
    anthropic_model: str = "claude-haiku-4-5"
    db_path: str = "firsttable.db"
    seed: int | None = None
    hub_token: str | None = None    # bearer token for worker endpoints
    hub_fallback: str = "mock"      # provider used when no worker is online


def load_config() -> Config:
    seed = os.environ.get("FIRSTTABLE_SEED")
    return Config(
        provider=os.environ.get("FIRSTTABLE_PROVIDER", "mock"),
        ollama_model=os.environ.get("FIRSTTABLE_OLLAMA_MODEL", "qwen3.5:9b"),
        ollama_url=os.environ.get("FIRSTTABLE_OLLAMA_URL", "http://localhost:11434"),
        anthropic_model=os.environ.get("FIRSTTABLE_ANTHROPIC_MODEL", "claude-haiku-4-5"),
        db_path=os.environ.get("FIRSTTABLE_DB", "firsttable.db"),
        seed=int(seed) if seed else None,
        hub_token=os.environ.get("FIRSTTABLE_HUB_TOKEN") or None,
        hub_fallback=os.environ.get("FIRSTTABLE_HUB_FALLBACK", "mock"),
    )
