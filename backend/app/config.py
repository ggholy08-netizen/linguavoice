"""Application settings, read from environment variables (and an optional .env file).

Secrets (GEMINI_API_KEY) live ONLY here, on the server. They are never sent to the browser.
"""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from functools import lru_cache

try:  # optional: load backend/.env during local development
    from dotenv import load_dotenv

    load_dotenv()
except Exception:  # pragma: no cover
    pass


def _int(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, str(default)))
    except ValueError:
        return default


def _bool(name: str, default: bool) -> bool:
    val = os.getenv(name)
    if val is None:
        return default
    return val.strip().lower() in {"1", "true", "yes", "on"}


def _list(name: str, default: str) -> list[str]:
    raw = os.getenv(name, default)
    return [x.strip().rstrip("/") for x in raw.split(",") if x.strip()]


@dataclass(frozen=True)
class Settings:
    gemini_api_key: str = field(default_factory=lambda: os.getenv("GEMINI_API_KEY", "").strip())
    # Verified Oct 2026: gemini-3.5-flash-lite is a stable model that accepts audio input,
    # supports structured (JSON) output and streaming, and is Google's fastest 3.5 model.
    gemini_model: str = field(default_factory=lambda: os.getenv("GEMINI_MODEL", "gemini-3.5-flash-lite").strip())
    # "" = automatic per model; or minimal / low / medium / high; or "off" to send no thinking config.
    gemini_thinking_level: str = field(default_factory=lambda: os.getenv("GEMINI_THINKING_LEVEL", "").strip().lower())
    gemini_timeout_s: int = field(default_factory=lambda: _int("GEMINI_TIMEOUT_S", 25))
    gemini_max_output_tokens: int = field(default_factory=lambda: _int("GEMINI_MAX_OUTPUT_TOKENS", 8192))

    tts_timeout_s: int = field(default_factory=lambda: _int("TTS_TIMEOUT_S", 20))
    tts_parallel_segments: int = field(default_factory=lambda: _int("TTS_PARALLEL_SEGMENTS", 2))
    voices_cache_ttl_s: int = field(default_factory=lambda: _int("VOICES_CACHE_TTL_S", 6 * 3600))

    # Exact origins allowed to call this API, e.g. https://username.github.io
    allowed_origins: list[str] = field(
        default_factory=lambda: _list(
            "ALLOWED_ORIGINS", "http://localhost:8080,http://127.0.0.1:8080,http://localhost:5500,http://127.0.0.1:5500"
        )
    )
    max_audio_bytes: int = field(default_factory=lambda: _int("MAX_AUDIO_BYTES", 3_000_000))  # ~90 s of 16 kHz WAV
    max_image_bytes: int = field(default_factory=lambda: _int("MAX_IMAGE_BYTES", 4_000_000))  # one camera photo
    max_tts_chars: int = field(default_factory=lambda: _int("MAX_TTS_CHARS", 6000))
    max_text_chars: int = field(default_factory=lambda: _int("MAX_TEXT_CHARS", 3000))  # typed text to translate
    rate_limit_per_min: int = field(default_factory=lambda: _int("RATE_LIMIT_PER_MIN", 30))
    trust_proxy_headers: bool = field(default_factory=lambda: _bool("TRUST_PROXY_HEADERS", True))
    log_level: str = field(default_factory=lambda: os.getenv("LOG_LEVEL", "INFO").upper())


@lru_cache
def get_settings() -> Settings:
    return Settings()
