"""Shared singletons (created once per process)."""
from __future__ import annotations

from functools import lru_cache

from .config import get_settings
from .security import RateLimiter
from .services.edge_tts_service import EdgeTTSService
from .services.gemini_service import GeminiTranslator


@lru_cache
def get_translator() -> GeminiTranslator:
    return GeminiTranslator(get_settings())


@lru_cache
def get_tts() -> EdgeTTSService:
    return EdgeTTSService(get_settings())


@lru_cache
def get_limiter() -> RateLimiter:
    return RateLimiter(get_settings().rate_limit_per_min)
