/* LinguaVoice AI — service worker.
   - Caches the app shell so it opens instantly and works offline (history, settings).
   - Translation and Edge TTS always need the internet: requests to the backend are never cached.
   - Bump VERSION on every release: the app then shows "Жаңа нұсқа дайын → Жаңарту". */
const VERSION = "2.0.0-r1-games2";
const CACHE = `linguavoice-${VERSION}`;
const SHELL = [
  "./", "./index.html", "./offline.html", "./config.js", "./manifest.webmanifest", "./css/app.css",
  "./icons/icon.svg", "./icons/icon-192.png", "./icons/icon-512.png", "./icons/icon-maskable-512.png", "./icons/apple-touch-icon.png",
  "./js/app.js", "./js/utils.js", "./js/i18n.js", "./js/state.js", "./js/router.js", "./js/net.js", "./js/pwa.js",
  "./js/speech/microphone.js", "./js/speech/recognition.js",
  "./js/translation/translator.js", "./js/translation/language-detection.js",
  "./js/voice/playback.js", "./js/voice/tts.js",
  "./js/storage/history.js", "./js/storage/settings.js",
  "./js/ui/components.js", "./js/ui/notifications.js", "./js/ui/status.js", "./js/ui/wave.js",
  "./js/views/dashboard.js", "./js/views/conversation.js", "./js/views/history.js", "./js/views/settings.js",
  "./css/games.css",
  "./js/games/hub.js", "./js/games/core.js", "./js/games/content.js", "./js/games/text-diff.js", "./js/games/voice-round.js",
  "./js/games/race.js", "./js/games/dictation.js", "./js/games/flashcards.js", "./js/games/saytranslate.js",
  "./js/games/twister.js", "./js/games/quickanswer.js", "./js/games/travel.js", "./js/games/detective.js", "./js/games/duel.js",
  "./js/games/memory.js", "./js/games/wordbuild.js", "./js/games/camera.js"
];
// Always fetched fresh when online (so a changed backend address applies at once).
const NETWORK_FIRST = new Set(["config.js", "index.html", ""]);

self.addEventListener("install", e => {
  // file by file: one missing file (for example a forgotten icon) must not stop the whole app from installing
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(SHELL.map(u => c.add(new Request(u, { cache: "reload" })).catch(() => null)))));
});

self.addEventListener("activate", e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith("linguavoice-") && k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener("message", e => { if (e.data && e.data.type === "SKIP_WAITING") self.skipWaiting(); });

async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(req, { cache: "no-store" });
    if (res && res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    const hit = await cache.match(req, { ignoreSearch: true });
    if (hit) return hit;
    if (req.mode === "navigate") return (await cache.match("./index.html")) || (await cache.match("./offline.html"));
    throw new Error("offline");
  }
}

async function cacheFirst(req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req, { ignoreSearch: true });
  if (hit) return hit;
  const res = await fetch(req);
  if (res && res.ok && res.type === "basic") cache.put(req, res.clone());
  return res;
}

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // backend (Render), Gemini, Edge TTS: never touched
  const scope = new URL(self.registration.scope);
  const rel = url.pathname.startsWith(scope.pathname) ? url.pathname.slice(scope.pathname.length) : url.pathname;
  if (req.mode === "navigate" || NETWORK_FIRST.has(rel)) { e.respondWith(networkFirst(req)); return; }
  e.respondWith(cacheFirst(req));
});
