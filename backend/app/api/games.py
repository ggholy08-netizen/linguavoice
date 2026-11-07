"""Game endpoints. Gemini key stays on the server; every request is validated and rate-limited."""
from __future__ import annotations

from fastapi import APIRouter, File, Form, Request, UploadFile
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from ..config import get_settings
from ..deps import get_games, get_limiter
from ..security import client_key
from ..services.gemini_service import TranslationError
from ..services.game_service import parse_meta
from .translate import ALLOWED_AUDIO

router = APIRouter(prefix="/api/game", tags=["games"])


def _err(code: str, message: str, status: int) -> JSONResponse:
    return JSONResponse({"error": {"code": code, "message": message}}, status_code=status)


def _limited(request: Request) -> bool:
    return not get_limiter().allow(client_key(request, get_settings()))


async def _read_audio(audio: UploadFile) -> tuple[bytes, str]:
    s = get_settings()
    mime = (audio.content_type or "audio/wav").split(";")[0].strip().lower()
    if mime not in ALLOWED_AUDIO:
        raise TranslationError("bad_audio", f"Unsupported audio type {mime}", 415)
    data = await audio.read(s.max_audio_bytes + 1)
    if len(data) > s.max_audio_bytes:
        raise TranslationError("audio_too_large", "Audio is too long", 413)
    if len(data) < 1000:
        raise TranslationError("no_speech", "Audio is empty", 400)
    return data, ("audio/wav" if "wav" in mime else mime)


class GenerateRequest(BaseModel):
    kind: str
    know: str
    learn: str
    level: str = "medium"
    n: int = Field(10, ge=1, le=20)
    topic: str = ""


@router.post("/generate")
async def generate(req: GenerateRequest, request: Request):
    if _limited(request):
        return _err("rate_limited", "Too many requests", 429)
    try:
        items = await get_games().generate(req.kind, req.know, req.learn, req.level, req.n, req.topic)
    except TranslationError as e:
        return _err(e.code, e.message, e.status)
    return {"items": items}


@router.post("/voice")
async def voice(request: Request, audio: UploadFile = File(...), meta: str = Form("{}")):
    """meta: {task: translate|answer|transcribe, lang, know, prompt, reference, level}"""
    if _limited(request):
        return _err("rate_limited", "Too many requests", 429)
    try:
        m = parse_meta(meta)
        data, mime = await _read_audio(audio)
        res = await get_games().check_voice(
            data, mime, str(m.get("task", "")), str(m.get("lang", "")), str(m.get("know", "") or ""),
            str(m.get("prompt", "") or ""), str(m.get("reference", "") or ""), str(m.get("level", "medium")),
        )
    except TranslationError as e:
        return _err(e.code, e.message, e.status)
    if not res.get("transcript"):
        return _err("no_speech", "No intelligible speech detected", 422)
    return res


@router.post("/roleplay")
async def roleplay(request: Request, meta: str = Form("{}"), audio: UploadFile | None = File(None)):
    """meta: {scenario, learn, know, level, history:[{role:user|ai,text}], text, start}"""
    if _limited(request):
        return _err("rate_limited", "Too many requests", 429)
    try:
        m = parse_meta(meta)
        hist = m.get("history") or []
        if not isinstance(hist, list):
            raise TranslationError("bad_request", "Bad history", 400)
        hist = [h for h in hist if isinstance(h, dict)][-12:]
        data, mime = (await _read_audio(audio)) if audio is not None else (None, "audio/wav")
        res = await get_games().roleplay(
            str(m.get("scenario", "")), str(m.get("learn", "")), str(m.get("know", "")),
            str(m.get("level", "medium")), hist, str(m.get("text", "") or ""), data, mime, bool(m.get("start")),
        )
    except TranslationError as e:
        return _err(e.code, e.message, e.status)
    return res
