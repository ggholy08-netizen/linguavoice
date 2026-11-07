"""Edge TTS HTTP endpoints: voice list and speech synthesis."""
from __future__ import annotations

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel, Field

from ..config import get_settings
from ..deps import get_limiter, get_tts
from ..languages import LANGUAGES, is_supported
from ..security import client_key
from ..services.edge_tts_service import AUDIO_MIME, TTSError
from ..services.text_utils import split_text

router = APIRouter(prefix="/api", tags=["speech"])


def _err(code: str, message: str, status: int) -> JSONResponse:
    return JSONResponse({"error": {"code": code, "message": message}}, status_code=status)


@router.get("/voices")
async def voices():
    """All Edge TTS voices (live list) plus the automatic default voice for each supported language."""
    tts = get_tts()
    vs = await tts.voices()
    if not vs:
        return _err("tts_unavailable", "Edge TTS voice list could not be loaded", 503)
    defaults = {code: tts.default_voice(code, vs) for code in LANGUAGES}
    return {
        "voices": vs,
        "defaults": {k: v for k, v in defaults.items() if v},
        "languages_with_voices": sorted(k for k, v in defaults.items() if v),
    }


class SpeechRequest(BaseModel):
    text: str = Field(min_length=1)
    lang: str
    voice: str | None = "auto"
    rate: int = Field(0, ge=-50, le=100)
    volume: int = Field(0, ge=-50, le=50)


@router.post("/tts")
async def tts(req: SpeechRequest, request: Request):
    s = get_settings()
    if not get_limiter().allow(client_key(request, s)):
        return _err("rate_limited", "Too many requests", 429)
    if not is_supported(req.lang):
        return _err("bad_request", "Unsupported language", 400)
    text = req.text.strip()
    if len(text) > s.max_tts_chars:
        return _err("text_too_long", "Text is too long", 413)
    service = get_tts()
    try:
        voice = await service.resolve_voice(req.lang, req.voice)
        parts = [await service.synthesize(seg, voice, req.rate, req.volume) for seg in split_text(text, 600)]
    except TTSError as e:
        return _err(e.code, e.message, e.status)
    # Consecutive MP3 streams with identical parameters concatenate into one valid MP3.
    return Response(b"".join(parts), media_type=AUDIO_MIME, headers={"X-Voice": voice, "Cache-Control": "no-store"})
