/* =====================================================================
   LinguaVoice AI — CONFIGURATION
   ---------------------------------------------------------------------
   This is the ONLY file you ever need to edit, and only if your backend
   address changes. Future updates of the app do not touch this file.

   API_BASE_URL : the HTTPS address of your FastAPI backend on Render
                  (no trailing slash, no /api, no /ws).
   The Gemini API key is NOT here — it lives only on the backend
   (GEMINI_API_KEY environment variable on Render).
   ===================================================================== */
window.LV_CONFIG = {
  API_BASE_URL: "https://linguavoice-ux4j.onrender.com",

  REQUEST_TIMEOUT_MS: 30000,   // max wait for a translation / for the voice
  DEFAULT_SILENCE_MS: 500,     // end-of-speech pause (250–1200 ms, user-adjustable)
  MAX_RECORDING_MS: 60000,     // hard cap for one utterance
  NO_SPEECH_TIMEOUT_MS: 8000,  // stop listening if nobody speaks
  HISTORY_LIMIT: 1000          // local history entries kept (favourites are never pruned)
};
