"""HTTP translation endpoint (fallback when the WebSocket is unavailable)."""
from __future__ import annotations

from fastapi import APIRouter, File, Form, Request, UploadFile
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from ..config import get_settings
from ..deps import get_limiter, get_translator
from ..languages import is_supported
from ..security import client_key
from ..services.gemini_service import TranslationError

router = APIRouter(prefix="/api", tags=["translate"])

ALLOWED_AUDIO = {"audio/wav", "audio/x-wav", "audio/wave", "audio/webm", "audio/ogg", "audio/mp4", "audio/mpeg", "audio/aac", "audio/flac"}


def _err(code: str, message: str, status: int) -> JSONResponse:
    return JSONResponse({"error": {"code": code, "message": message}}, status_code=status)


@router.post("/translate")
async def translate(
    request: Request,
    audio: UploadFile = File(...),
    source_lang: str = Form("auto"),
    target_lang: str = Form(...),
):
    s = get_settings()
    if not get_limiter().allow(client_key(request, s)):
        return _err("rate_limited", "Too many requests", 429)
    if not is_supported(target_lang):
        return _err("bad_request", "Unsupported target language", 400)
    if source_lang != "auto" and not is_supported(source_lang):
        return _err("bad_request", "Unsupported source language", 400)
    mime = (audio.content_type or "audio/wav").split(";")[0].strip().lower()
    if mime not in ALLOWED_AUDIO:
        return _err("bad_audio", f"Unsupported audio type {mime}", 415)
    data = await audio.read(s.max_audio_bytes + 1)
    if len(data) > s.max_audio_bytes:
        return _err("audio_too_large", "Audio is too long", 413)
    if len(data) < 1000:
        return _err("no_speech", "Audio is empty", 400)
    try:
        ev = await get_translator().translate(data, "audio/wav" if "wav" in mime else mime, source_lang, target_lang)
    except TranslationError as e:
        return _err(e.code, e.message, e.status)
    if not ev.recognized_text:
        return _err("no_speech", "No intelligible speech detected", 422)
    return {
        "detected_language": ev.detected_language,
        "recognized_text": ev.recognized_text,
        "translated_text": ev.translated_text,
        "timings": {"gemini_ms": ev.total_ms, "gemini_first_token_ms": ev.first_token_ms},
    }


class TextRequest(BaseModel):
    text: str
    source_lang: str = "auto"
    target_lang: str


@router.post("/translate_text")
async def translate_text(req: TextRequest, request: Request):
    s = get_settings()
    if not get_limiter().allow(client_key(request, s)):
        return _err("rate_limited", "Too many requests", 429)
    if not is_supported(req.target_lang) or (req.source_lang != "auto" and not is_supported(req.source_lang)):
        return _err("bad_request", "Unsupported language", 400)
    text = req.text.strip()
    if not text:
        return _err("empty_text", "Text is empty", 400)
    if len(text) > s.max_text_chars:
        return _err("text_too_long", "Text is too long", 413)
    try:
        ev = await get_translator().translate_text(text, req.source_lang, req.target_lang)
    except TranslationError as e:
        return _err(e.code, e.message, e.status)
    if not ev.translated_text:
        return _err("translate_failed", "Empty translation", 502)
    return {
        "detected_language": ev.detected_language,
        "recognized_text": ev.recognized_text,
        "translated_text": ev.translated_text,
        "timings": {"gemini_ms": ev.total_ms, "gemini_first_token_ms": ev.first_token_ms},
    }
