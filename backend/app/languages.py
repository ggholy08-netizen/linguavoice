"""Supported languages. Codes must match the LANGS list in index.html."""
from __future__ import annotations

# code -> English name (used inside the Gemini prompt)
LANGUAGES: dict[str, str] = {
    "kk": "Kazakh", "ru": "Russian", "en": "English", "tr": "Turkish", "uz": "Uzbek",
    "ky": "Kyrgyz", "tg": "Tajik", "tk": "Turkmen", "mn": "Mongolian", "az": "Azerbaijani",
    "zh": "Chinese (Simplified)", "ja": "Japanese", "ko": "Korean", "de": "German", "fr": "French",
    "es": "Spanish", "it": "Italian", "pt": "Portuguese", "ar": "Arabic", "fa": "Persian",
    "hi": "Hindi", "ur": "Urdu", "bn": "Bengali", "uk": "Ukrainian", "be": "Belarusian",
    "pl": "Polish", "cs": "Czech", "nl": "Dutch", "sv": "Swedish", "fi": "Finnish",
    "da": "Danish", "no": "Norwegian", "el": "Greek", "he": "Hebrew", "hu": "Hungarian",
    "ro": "Romanian", "bg": "Bulgarian", "sr": "Serbian", "hr": "Croatian", "ka": "Georgian",
    "hy": "Armenian", "id": "Indonesian", "ms": "Malay", "vi": "Vietnamese", "th": "Thai",
}

# Edge TTS locale prefixes for a language code (when they differ from the code itself).
VOICE_LOCALE_PREFIX: dict[str, list[str]] = {"no": ["nb", "nn", "no"]}

# Preferred Edge TTS locale per language (used for automatic voice choice).
PREFERRED_LOCALE: dict[str, str] = {
    "kk": "kk-KZ", "ru": "ru-RU", "en": "en-US", "tr": "tr-TR", "uz": "uz-UZ", "mn": "mn-MN",
    "az": "az-AZ", "zh": "zh-CN", "ja": "ja-JP", "ko": "ko-KR", "de": "de-DE", "fr": "fr-FR",
    "es": "es-ES", "it": "it-IT", "pt": "pt-BR", "ar": "ar-SA", "fa": "fa-IR", "hi": "hi-IN",
    "ur": "ur-PK", "bn": "bn-IN", "uk": "uk-UA", "pl": "pl-PL", "cs": "cs-CZ", "nl": "nl-NL",
    "sv": "sv-SE", "fi": "fi-FI", "da": "da-DK", "no": "nb-NO", "el": "el-GR", "he": "he-IL",
    "hu": "hu-HU", "ro": "ro-RO", "bg": "bg-BG", "sr": "sr-RS", "hr": "hr-HR", "ka": "ka-GE",
    "id": "id-ID", "ms": "ms-MY", "vi": "vi-VN", "th": "th-TH",
}

# Preferred default voices. Used only if they appear in the live Edge TTS voice list,
# or (for these few) as a last resort when the voice list cannot be downloaded.
PREFERRED_VOICES: dict[str, str] = {
    "kk": "kk-KZ-AigulNeural", "ru": "ru-RU-SvetlanaNeural", "en": "en-US-AriaNeural",
    "tr": "tr-TR-EmelNeural", "uz": "uz-UZ-MadinaNeural", "de": "de-DE-KatjaNeural",
    "fr": "fr-FR-DeniseNeural", "es": "es-ES-ElviraNeural", "it": "it-IT-ElsaNeural",
    "pt": "pt-BR-FranciscaNeural", "zh": "zh-CN-XiaoxiaoNeural", "ja": "ja-JP-NanamiNeural",
    "ko": "ko-KR-SunHiNeural", "ar": "ar-SA-ZariyahNeural", "uk": "uk-UA-PolinaNeural",
}

_ALIASES = {"iw": "he", "in": "id", "nb": "no", "nn": "no", "zh-cn": "zh", "zh-tw": "zh", "fil": "tl"}


def normalize_code(code: str | None) -> str:
    """Normalize a language code returned by the model (e.g. 'ru-RU', 'iw') to our 2-letter form."""
    if not code:
        return "und"
    c = code.strip().lower().replace("_", "-")
    if c in _ALIASES:
        return _ALIASES[c]
    base = c.split("-")[0]
    return _ALIASES.get(base, base) or "und"


def is_supported(code: str) -> bool:
    return code in LANGUAGES


def voice_prefixes(code: str) -> list[str]:
    return VOICE_LOCALE_PREFIX.get(code, [code])
