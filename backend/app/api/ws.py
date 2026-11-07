"""WebSocket endpoint: the low-latency path used by the frontend.

Why a WebSocket: one persistent TLS connection (no handshake per utterance), binary
audio upload without base64, server-pushed progress (partial transcript/translation),
ordered streaming of Edge TTS audio segments, and instant cancellation.

Client -> server
  binary frame : [uint32 BE header length][JSON header][audio bytes]
                 header = {"type":"translate","id":str,"source_lang":"auto"|code,"target_lang":code,
                           "voice":"auto"|id,"rate":int,"tts":bool,"mime":"audio/wav"}
  text JSON    : {"type":"translate_text","id","text","source_lang","target_lang","voice","rate","tts"}
                 {"type":"speak","id","text","lang","voice","rate"}
                 {"type":"cancel","id"} | {"type":"ping"}
Server -> client
  text JSON    : ready | status | partial | result | tts_done | error | pong | cancelled
  binary frame : [uint32 BE header length][JSON {"id","seq","mime"}][mp3 bytes]
"""
from __future__ import annotations

import asyncio
import contextlib
import json
import logging
import struct
import time

from fastapi import APIRouter, WebSocket
from starlette.websockets import WebSocketDisconnect, WebSocketState

from ..config import get_settings
from ..deps import get_limiter, get_translator, get_tts
from ..languages import is_supported
from ..security import client_key, origin_allowed
from ..services.edge_tts_service import AUDIO_MIME, TTSError, TTSPipeline
from ..services.gemini_service import TranslationError
from ..services.text_utils import SentenceSegmenter, split_text

router = APIRouter()
log = logging.getLogger("linguavoice.ws")


def pack_frame(header: dict, payload: bytes) -> bytes:
    h = json.dumps(header, separators=(",", ":")).encode()
    return struct.pack(">I", len(h)) + h + payload


def unpack_frame(data: bytes, max_header: int = 4096) -> tuple[dict, bytes]:
    if len(data) < 4:
        raise ValueError("frame too short")
    (hlen,) = struct.unpack(">I", data[:4])
    if hlen <= 0 or hlen > max_header or 4 + hlen > len(data):
        raise ValueError("bad header length")
    header = json.loads(data[4 : 4 + hlen].decode())
    if not isinstance(header, dict):
        raise ValueError("header must be an object")
    return header, data[4 + hlen :]


class Session:
    def __init__(self, ws: WebSocket):
        self.ws = ws
        self.settings = get_settings()
        self.translator = get_translator()
        self.tts = get_tts()
        self.limiter = get_limiter()
        self.client = client_key(ws, self.settings)
        self.send_lock = asyncio.Lock()
        self.job: asyncio.Task | None = None
        self.job_id: str | None = None

    # ---------- sending ----------
    async def send_json(self, obj: dict) -> None:
        if self.ws.client_state != WebSocketState.CONNECTED:
            return
        async with self.send_lock:
            await self.ws.send_text(json.dumps(obj, ensure_ascii=False, separators=(",", ":")))

    async def send_bytes(self, data: bytes) -> None:
        if self.ws.client_state != WebSocketState.CONNECTED:
            return
        async with self.send_lock:
            await self.ws.send_bytes(data)

    async def error(self, rid: str | None, code: str, message: str = "") -> None:
        await self.send_json({"type": "error", "id": rid, "code": code, "message": message or code})

    # ---------- job control ----------
    async def cancel_job(self) -> None:
        job, self.job, self.job_id = self.job, None, None
        if job and not job.done():
            job.cancel()
            with contextlib.suppress(asyncio.CancelledError, Exception):
                await job

    async def start_job(self, rid: str, coro) -> None:
        await self.cancel_job()  # a new request makes any running one obsolete
        self.job_id = rid
        self.job = asyncio.create_task(self._guard(rid, coro))

    async def _guard(self, rid: str, coro) -> None:
        try:
            await coro
        except asyncio.CancelledError:
            raise
        except TranslationError as e:
            await self.error(rid, e.code, e.message)
        except TTSError as e:
            await self.error(rid, e.code, e.message)
        except Exception as e:  # pragma: no cover
            log.exception("job failed")
            await self.error(rid, "internal", type(e).__name__)
        finally:
            if self.job_id == rid:
                self.job_id = None

    def _audio_sender(self, rid: str):
        async def send(seq: int, data: bytes) -> None:
            await self.send_bytes(pack_frame({"id": rid, "seq": seq, "mime": AUDIO_MIME}, data))

        return send

    # ---------- pipelines ----------
    async def run_translate(self, rid: str, h: dict, audio: bytes | None, text: str | None = None) -> None:
        t_recv = time.perf_counter()
        typed = text is not None
        source, target = h["source_lang"], h["target_lang"]
        want_tts = bool(h.get("tts", True))
        rate = int(h.get("rate", 0))
        pipeline: TTSPipeline | None = None
        voice = None
        if want_tts:
            voice = await self.tts.resolve_voice(target, h.get("voice") or "auto")
            pipeline = TTSPipeline(self.tts, voice, rate, self._audio_sender(rid), self.settings.tts_parallel_segments)
        seg = SentenceSegmenter()
        await self.send_json({"type": "status", "id": rid, "stage": "translating" if typed else "recognizing"})
        sent_translating = typed
        final = None
        events = (
            self.translator.stream_translate_text(text, source, target)
            if typed
            else self.translator.stream_translate(audio, h.get("mime", "audio/wav"), source, target)
        )
        try:
            async for ev in events:
                if ev.kind == "partial":
                    if ev.translated_text and not sent_translating:
                        sent_translating = True
                        await self.send_json({"type": "status", "id": rid, "stage": "translating"})
                    await self.send_json(
                        {
                            "type": "partial", "id": rid, "detected_language": ev.detected_language,
                            "recognized_text": ev.recognized_text, "translated_text": ev.translated_text,
                        }
                    )
                    if pipeline and ev.translated_text and (typed or ev.detected_language != "und"):
                        for s in seg.feed(ev.translated_text):
                            pipeline.add(s)  # Edge TTS starts on the first full sentence
                else:
                    final = ev
            assert final is not None
            if typed and not final.translated_text:
                if pipeline:
                    pipeline.cancel()
                await self.error(rid, "translate_failed", "Gemini returned an empty translation")
                return
            if not typed and (not final.recognized_text or final.detected_language == "und" or not final.translated_text):
                if pipeline:
                    pipeline.cancel()
                await self.error(rid, "no_speech", "No intelligible speech detected")
                return
            await self.send_json(
                {
                    "type": "result", "id": rid, "detected_language": final.detected_language,
                    "recognized_text": final.recognized_text, "translated_text": final.translated_text,
                    "voice": voice,
                    "timings": {
                        "gemini_ms": final.total_ms, "gemini_first_token_ms": final.first_token_ms,
                        "server_ms": int((time.perf_counter() - t_recv) * 1000),
                    },
                }
            )
            if pipeline:
                for s in seg.feed(final.translated_text, final=True):
                    pipeline.add(s)
                await self.send_json({"type": "status", "id": rid, "stage": "tts"})
                await pipeline.finish()
                await self.send_json(
                    {
                        "type": "tts_done", "id": rid, "segments": pipeline.segments, "voice": voice,
                        "tts_first_ms": pipeline.first_audio_ms, "tts_total_ms": pipeline.total_ms,
                    }
                )
        except BaseException:
            if pipeline:
                pipeline.cancel()
            raise

    async def run_speak(self, rid: str, m: dict) -> None:
        text = str(m.get("text", "")).strip()
        lang = m.get("lang")
        if not text or not is_supported(lang):
            await self.error(rid, "bad_request", "text and supported lang required")
            return
        if len(text) > self.settings.max_tts_chars:
            await self.error(rid, "text_too_long")
            return
        voice = await self.tts.resolve_voice(lang, m.get("voice") or "auto")
        await self.send_json({"type": "status", "id": rid, "stage": "tts"})
        pipeline = TTSPipeline(self.tts, voice, int(m.get("rate", 0)), self._audio_sender(rid), self.settings.tts_parallel_segments)
        try:
            for s in split_text(text):
                pipeline.add(s)
            await pipeline.finish()
        except BaseException:
            pipeline.cancel()
            raise
        await self.send_json(
            {"type": "tts_done", "id": rid, "segments": pipeline.segments, "voice": voice,
             "tts_first_ms": pipeline.first_audio_ms, "tts_total_ms": pipeline.total_ms}
        )

    # ---------- receive loop ----------
    async def handle_binary(self, data: bytes) -> None:
        try:
            h, audio = unpack_frame(data)
        except (ValueError, json.JSONDecodeError):
            await self.error(None, "bad_request", "malformed frame")
            return
        rid = str(h.get("id", ""))[:64] or None
        if h.get("type") != "translate":
            await self.error(rid, "bad_request", "unknown binary message")
            return
        target, source = h.get("target_lang"), h.get("source_lang", "auto")
        if not is_supported(target) or (source != "auto" and not is_supported(source)):
            await self.error(rid, "bad_request", "unsupported language")
            return
        if len(audio) > self.settings.max_audio_bytes:
            await self.error(rid, "audio_too_large")
            return
        if len(audio) < 1000:
            await self.error(rid, "no_speech", "audio is empty")
            return
        mime = str(h.get("mime", "audio/wav")).split(";")[0]
        if mime not in {"audio/wav", "audio/webm", "audio/ogg", "audio/mp4"}:
            await self.error(rid, "bad_audio", "unsupported audio type")
            return
        h["mime"] = mime
        h["source_lang"], h["target_lang"] = source, target
        try:
            h["rate"] = max(-50, min(100, int(h.get("rate", 0))))
        except (TypeError, ValueError):
            h["rate"] = 0
        if not self.limiter.allow(self.client):
            await self.error(rid, "rate_limited", "Too many requests")
            return
        await self.start_job(rid, self.run_translate(rid, h, audio))

    async def handle_text(self, raw: str) -> None:
        try:
            m = json.loads(raw)
            assert isinstance(m, dict)
        except Exception:
            await self.error(None, "bad_request", "invalid JSON")
            return
        t = m.get("type")
        rid = str(m.get("id", ""))[:64] or None
        if t == "ping":
            await self.send_json({"type": "pong", "t": m.get("t")})
        elif t == "cancel":
            if rid is None or rid == self.job_id:
                await self.cancel_job()
            await self.send_json({"type": "cancelled", "id": rid})
        elif t == "translate_text":
            text = m.get("text")
            target, source = m.get("target_lang"), m.get("source_lang", "auto")
            if not isinstance(text, str) or not text.strip():
                await self.error(rid, "empty_text", "text required")
                return
            if len(text) > self.settings.max_text_chars:
                await self.error(rid, "text_too_long")
                return
            if not is_supported(target) or (source != "auto" and not is_supported(source)):
                await self.error(rid, "bad_request", "unsupported language")
                return
            if not self.limiter.allow(self.client):
                await self.error(rid, "rate_limited", "Too many requests")
                return
            try:
                rate = max(-50, min(100, int(m.get("rate", 0))))
            except (TypeError, ValueError):
                rate = 0
            h = {"source_lang": source, "target_lang": target, "voice": m.get("voice") or "auto",
                 "rate": rate, "tts": bool(m.get("tts", True))}
            await self.start_job(rid, self.run_translate(rid, h, None, text.strip()))
        elif t == "speak":
            if not self.limiter.allow(self.client):
                await self.error(rid, "rate_limited", "Too many requests")
                return
            try:
                m["rate"] = max(-50, min(100, int(m.get("rate", 0))))
            except (TypeError, ValueError):
                m["rate"] = 0
            await self.start_job(rid, self.run_speak(rid, m))
        else:
            await self.error(rid, "bad_request", "unknown message type")

    async def run(self) -> None:
        await self.send_json(
            {"type": "ready", "model": self.translator.model, "tts": "edge-tts",
             "gemini_configured": self.translator.configured}
        )
        try:
            while True:
                msg = await self.ws.receive()
                if msg["type"] == "websocket.disconnect":
                    break
                if msg.get("bytes") is not None:
                    await self.handle_binary(msg["bytes"])
                elif msg.get("text") is not None:
                    await self.handle_text(msg["text"])
        except WebSocketDisconnect:
            pass
        finally:
            await self.cancel_job()


@router.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    settings = get_settings()
    if not origin_allowed(ws.headers.get("origin"), settings):
        log.warning("Rejected WebSocket from origin %r", ws.headers.get("origin"))
        await ws.close(code=1008)
        return
    await ws.accept()
    await Session(ws).run()
