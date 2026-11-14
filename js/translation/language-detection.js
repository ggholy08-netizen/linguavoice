// AUTO LANGUAGE: keeps a *stable* spoken language so a cough, a name or one foreign word
// does not flip the conversation language.
// Gemini returns the language of each phrase but no confidence score, so stability is judged by
// phrase length and repetition instead (no invented confidence numbers are shown).

const MIN_WORDS = 3;   // a phrase this long is trusted on its own
const REPEATS = 2;     // shorter phrases must agree this many times in a row

const words = t => (t || "").trim().split(/\s+/).filter(Boolean).length;

export const Detection = {
  stable: null,        // language code considered "the speaker's language"
  pending: null, pendingCount: 0,
  observe(lang, text) {
    if (!lang || lang === "und") return this.stable;
    if (lang === this.stable) { this.pending = null; this.pendingCount = 0; return this.stable; }
    if (words(text) >= MIN_WORDS) { this.stable = lang; this.pending = null; this.pendingCount = 0; return this.stable; }
    if (this.pending === lang) this.pendingCount++; else { this.pending = lang; this.pendingCount = 1; }
    if (this.pendingCount >= REPEATS || !this.stable) { this.stable = lang; this.pending = null; this.pendingCount = 0; }
    return this.stable;
  },
  reset() { this.stable = null; this.pending = null; this.pendingCount = 0; }
};
