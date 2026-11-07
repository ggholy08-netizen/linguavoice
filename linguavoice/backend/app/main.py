"""LinguaVoice AI backend — FastAPI app.

Run locally:   uvicorn app.main:app --reload --port 8000
"""
from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware

from .api import speech, translate, ws
from .config import get_settings
from .deps import get_translator, get_tts

settings = get_settings()
logging.basicConfig(level=settings.log_level, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("linguavoice")


@asynccontextmanager
async def lifespan(app: FastAPI):
    if not settings.gemini_api_key:
        log.error("GEMINI_API_KEY is not set — translation requests will fail until it is configured.")
    log.info("Model: %s | allowed origins: %s", settings.gemini_model, settings.allowed_origins)
    # Warm the Edge TTS voice cache in the background so the first request is fast.
    warm = asyncio.create_task(get_tts().voices())
    yield
    warm.cancel()


app = FastAPI(title="LinguaVoice AI backend", version="1.0.0", lifespan=lifespan, docs_url="/docs")

app.add_middleware(GZipMiddleware, minimum_size=1024)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,  # exact origins only — no "*"
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
    expose_headers=["X-Voice"],
    max_age=86400,
)

app.include_router(translate.router)
app.include_router(speech.router)
app.include_router(ws.router)


@app.get("/")
async def root():
    return {"service": "LinguaVoice AI backend", "health": "/api/health", "websocket": "/ws"}


@app.get("/api/health")
async def health():
    tr = get_translator()
    tts = get_tts()
    return {
        "status": "ok",
        "gemini_configured": tr.configured,
        "model": tr.model,
        "tts": "edge-tts",
        "voices_loaded": tts.voices_loaded,
        "voice_error": tts.last_voice_error,
    }
