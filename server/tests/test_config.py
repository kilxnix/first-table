import os

from firsttable.config import load_config


def test_defaults(monkeypatch):
    for k in list(os.environ):
        if k.startswith("FIRSTTABLE_"):
            monkeypatch.delenv(k)
    cfg = load_config()
    assert cfg.provider == "mock"
    assert cfg.anthropic_model == "claude-haiku-4-5"
    assert cfg.seed is None


def test_env_override(monkeypatch):
    monkeypatch.setenv("FIRSTTABLE_PROVIDER", "ollama")
    monkeypatch.setenv("FIRSTTABLE_SEED", "42")
    cfg = load_config()
    assert cfg.provider == "ollama"
    assert cfg.seed == 42
