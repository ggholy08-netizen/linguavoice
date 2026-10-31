"""Microsoft Edge TTS (python package `edge-tts`) — the only speech engine used by LinguaVoice.

Edge TTS is an online service: it needs network access from the server to Microsoft.
"""
from __future__ import annotations

import asyncio
import logging
import time
from typing import Awaitable, Callable

import edge_tts
from edge_tts import exceptions as tts_exc

from ..config import Settings
from ..languages import PREFERRED_LOCALE, PREFERRED_VOICES, voice_prefixes

log = logging.getLogger("linguavoice.tts")

AUDIO_MIME = "audio/mpeg"  # Edge TTS default output: 24 kHz mono MP3 — plays in every modern mobile browser


class TTSError(Exception):
    def __init__(self, code: str, message: str = "", status: int = 502):
        super().__init__(message or code)
        self.code = code
        self.message = message or code
        self.status = status


def rate_str(rate: int) -> str:
    rate = max(-50, min(100, int(rate)))
    return f"{rate:+d}%"


class EdgeTTSService:
    def __init__(self, settings: Settings):
        self.settings = settings
        self._voices: list[dict] | None = None
        self._voices_at = 0.0
        self._lock = asyncio.Lock()
        self.last_voice_error: str | None = None

    # ---------- voices ----------
    async def voices(self, force: bool = False) -> list[dict]:
        """Live voice list from Edge TTS (cached). Returns [] if the service is unreachable."""
        fresh = self._voices is not None and time.time() - self._voices_at < self.settings.voices_cache_ttl_s
        if fresh and not force:
            return self._voices or []
        async with self._lock:
            if self._voices is not None and time.time() - self._voices_at < self.settings.voices_cache_ttl_s and not force:
                return self._voices
            try:
                raw = await asyncio.wait_for(edge_tts.list_voices(), timeout=15)
                self._voices = [
                    {
                        "id": v["ShortName"],
                        "locale": v["Locale"],
                        "gender": v.get("Gender", ""),
                    }
                    for v in raw
                ]
                self._voices.sort(key=lambda v: (v["locale"], v["id"]))
                self._voices_at = time.time()
                self.last_voice_error = None
                log.info("Loaded %d Edge TTS voices", len(self._voices))
            except Exception as e:  # network failure etc.
                self.last_voice_error = f"{type(e).__name__}: {e}"
                log.warning("Could not load Edge TTS voice list: %s", self.last_voice_error)
                if self._voices is None:
                    return []
            return self._voices or []

    @property
    def voices_loaded(self) -> bool:
        return bool(self._voices)

    def voices_for(self, lang: str, voices: list[dict]) -> list[dict]:
        prefixes = voice_prefixes(lang)
        return [v for v in voices if v["locale"].split("-")[0].lower() in prefixes]

    def default_voice(self, lang: str, voices: list[dict]) -> str | None:
        cands = self.voices_for(lang, voices)
        if not voices:
            # voice list unavailable: fall back to a small set of long-standing Edge voice IDs
            return PREFERRED_VOICES.get(lang)
        if not cands:
            return None
        ids = {v["id"] for v in cands}
        pref = PREFERRED_VOICES.get(lang)
        if pref in ids:
            return pref
        loc = PREFERRED_LOCALE.get(lang)
        in_loc = [v for v in cands if v["locale"] == loc] or cands
        females = [v for v in in_loc if v["gender"].lower() == "female"]
        return (females or in_loc)[0]["id"]

    async def resolve_voice(self, lang: str, voice: str | None) -> str:
        voices = await self.voices()
        if voice and voice != "auto":
            if voices and voice not in {v["id"] for v in voices}:
                raise TTSError("tts_voice_unsupported", f"Voice {voice} is not offered by Edge TTS", 400)
            return voice
        chosen = self.default_voice(lang, voices)
        if not chosen:
            raise TTSError("tts_no_voice", f"Edge TTS has no voice for language '{lang}'", 400)
        return chosen

    # ---------- synthesis ----------
    async def synthesize(self, text: str, voice: str, rate: int = 0) -> bytes:
        """Synthesize one segment with Edge TTS and return complete MP3 bytes."""
        try:
            comm = edge_tts.Communicate(text, voice, rate=rate_str(rate))
        except ValueError as e:  # invalid voice / rate format
            raise TTSError("tts_voice_unsupported", str(e), 400) from e
        out = bytearray()
        try:
            async with asyncio.timeout(self.settings.tts_timeout_s):
                async for chunk in comm.stream():
                    if chunk["type"] == "audio":
                        out += chunk["data"]
        except TimeoutError as e:
            raise TTSError("tts_timeout", "Edge TTS timed out", 504) from e
        except tts_exc.NoAudioReceived as e:
            raise TTSError("tts_no_audio", "Edge TTS returned no audio (unsupported voice or text?)", 502) from e
        except (tts_exc.EdgeTTSException, OSError) as e:
            raise TTSError("tts_unavailable", f"Edge TTS unavailable: {type(e).__name__}", 503) from e
        except Exception as e:  # aiohttp client errors and similar
            if type(e).__module__.startswith("aiohttp"):
                raise TTSError("tts_unavailable", f"Edge TTS unavailable: {type(e).__name__}", 503) from e
            raise
        if not out:
            raise TTSError("tts_no_audio", "Edge TTS returned no audio", 502)
        return bytes(out)


SendAudio = Callable[[int, bytes], Awaitable[None]]


class TTSPipeline:
    """Ordered, prefetching synthesis of text segments.

    Segments are added as soon as they are known (even while Gemini is still streaming).
    Up to N segments synthesize in parallel; audio is delivered strictly in order, so the
    client can start playing segment 0 while later segments are still being generated.
    """

    def __init__(self, tts: EdgeTTSService, voice: str, rate: int, send_audio: SendAudio, parallel: int = 2):
        self.tts = tts
        self.voice = voice
        self.rate = rate
        self.send_audio = send_audio
        self.sem = asyncio.Semaphore(max(1, parallel))
        self.queue: asyncio.Queue[asyncio.Task | None] = asyncio.Queue()
        self.tasks: list[asyncio.Task] = []
        self.started_at: float | None = None
        self.first_audio_ms: int | None = None
        self.total_ms: int | None = None
        self.segments = 0
        self.error: TTSError | None = None
        self._sender = asyncio.create_task(self._send_loop())

    async def _synth(self, text: str) -> bytes:
        async with self.sem:
            return await self.tts.synthesize(text, self.voice, self.rate)

    def add(self, text: str) -> None:
        if not text.strip() or self.error:
            return
        if self.started_at is None:
            self.started_at = time.perf_counter()
        t = asyncio.create_task(self._synth(text))
        self.tasks.append(t)
        self.queue.put_nowait(t)

    async def _send_loop(self) -> None:
        seq = 0
        while True:
            t = await self.queue.get()
            if t is None:
                break
            try:
                data = await t
            except TTSError as e:
                self.error = e
                break
            except Exception as e:  # pragma: no cover
                log.exception("TTS segment failed")
                self.error = TTSError("tts_unavailable", str(e)[:200], 503)
                break
            if self.first_audio_ms is None and self.started_at is not None:
                self.first_audio_ms = int((time.perf_counter() - self.started_at) * 1000)
            await self.send_audio(seq, data)
            seq += 1
            self.segments = seq
        if self.started_at is not None:
            self.total_ms = int((time.perf_counter() - self.started_at) * 1000)

    async def finish(self) -> None:
        self.queue.put_nowait(None)
        await self._sender
        if self.error:
            self.cancel()
            raise self.error

    def cancel(self) -> None:
        for t in self.tasks:
            t.cancel()
        if not self._sender.done():
            self._sender.cancel()
