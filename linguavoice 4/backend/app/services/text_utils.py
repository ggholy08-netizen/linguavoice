"""Helpers for incremental (streamed) JSON parsing and sentence segmentation."""
from __future__ import annotations

import json
import re

_KEY_RE_CACHE: dict[str, re.Pattern[str]] = {}


def extract_string_field(buf: str, key: str) -> tuple[str | None, bool]:
    """Extract the (possibly incomplete) value of a JSON string field from a partial JSON buffer.

    Returns (value, complete). value is None if the key has not started yet.
    Only fully-received escape sequences are decoded, so the value only ever grows.
    """
    pat = _KEY_RE_CACHE.get(key)
    if pat is None:
        pat = re.compile(r'"' + re.escape(key) + r'"\s*:\s*"')
        _KEY_RE_CACHE[key] = pat
    m = pat.search(buf)
    if not m:
        return None, False
    i = m.end()
    n = len(buf)
    safe_end = i  # index up to which the raw string is safe to decode
    complete = False
    while i < n:
        ch = buf[i]
        if ch == "\\":
            if i + 1 >= n:
                break
            nxt = buf[i + 1]
            if nxt == "u":
                if i + 6 > n:
                    break
                # keep surrogate pairs together
                code = buf[i + 2 : i + 6]
                try:
                    cp = int(code, 16)
                except ValueError:
                    break
                if 0xD800 <= cp <= 0xDBFF:
                    if i + 12 > n:
                        break
                    i += 12
                else:
                    i += 6
            else:
                i += 2
            safe_end = i
            continue
        if ch == '"':
            complete = True
            break
        i += 1
        safe_end = i
    raw = buf[m.end() : safe_end]
    try:
        value = json.loads('"' + raw + '"')
    except json.JSONDecodeError:
        # extremely defensive: fall back to the longest decodable prefix
        value = ""
        for cut in range(len(raw), 0, -1):
            try:
                value = json.loads('"' + raw[:cut] + '"')
                break
            except json.JSONDecodeError:
                continue
    return value, complete


_SENTENCE_END = re.compile(r"[.!?…。！？؟;]+[\"'»”)\]]*(?=\s)")
_SOFT_BREAK = re.compile(r"[,，、:：—–]\s")


class SentenceSegmenter:
    """Cuts a growing text into speakable segments as soon as each sentence is complete.

    feed() receives the full text-so-far each time; it returns newly completed segments.
    """

    def __init__(self, first_soft_min: int = 70, max_len: int = 220):
        self.pos = 0
        self.first_soft_min = first_soft_min
        self.max_len = max_len
        self.count = 0

    def feed(self, text: str, final: bool = False) -> list[str]:
        out: list[str] = []
        while True:
            rest = text[self.pos :]
            if not rest.strip():
                if final:
                    self.pos = len(text)
                break
            cut = None
            m = _SENTENCE_END.search(rest)
            if m:
                cut = m.end()
            elif len(rest) > self.max_len or (self.count == 0 and len(rest) > self.first_soft_min):
                # long run without a full stop: break on a comma/dash, else on a space
                window = rest[: self.max_len]
                soft = None
                for sm in _SOFT_BREAK.finditer(window):
                    if sm.end() >= 25:
                        soft = sm.end()
                if soft is None and len(rest) > self.max_len:
                    sp = window.rfind(" ")
                    soft = sp if sp > 40 else self.max_len
                cut = soft
            if cut is None:
                if final:
                    cut = len(rest)
                else:
                    break
            seg = rest[:cut].strip()
            self.pos += cut
            if seg:
                out.append(seg)
                self.count += 1
        return out


def split_text(text: str, max_len: int = 220) -> list[str]:
    """Split a complete text into speakable segments."""
    return SentenceSegmenter(first_soft_min=10_000, max_len=max_len).feed(text, final=True)
