// Ordered playback of Edge TTS MP3 segments through ONE <audio> element
// (no overlapping voices; a new group always stops the previous one).

export const Player = (() => {
  const el = new Audio(); el.preload = "auto"; el.setAttribute("playsinline", ""); el.setAttribute("webkit-playsinline", "");
  const SILENT = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQAAAAA=";
  let group = null, queue = [], open = false, playing = false, started = false, url = null, unlocked = false, listener = () => {};
  const emit = (type, g = group) => listener(type, g);
  function revoke() { if (url) { URL.revokeObjectURL(url); url = null; } }
  function unlock() {
    if (unlocked) return; unlocked = true;
    // A play() call inside a user gesture "blesses" this element on iOS/Safari, so later
    // programmatic play() of Edge TTS audio is allowed.
    try {
      el.muted = true; el.src = SILENT; const p = el.play();
      if (p) p.then(() => { if (!group) el.pause(); el.muted = false; })
               .catch(e => { el.muted = false; if (e && e.name === "NotAllowedError") unlocked = false; });
      else el.muted = false;
    } catch { el.muted = false; unlocked = false; }
  }
  function next() {
    revoke();
    if (!queue.length) { playing = false; if (!open && group) { const g = group; group = null; emit("ended", g); } else if (group) emit("drain"); return; }
    const blob = queue.shift(); url = URL.createObjectURL(blob);
    el.muted = false; el.src = url; playing = true;
    const g = group;
    const p = el.play();
    if (p && p.catch) p.catch(err => {
      if (g !== group) return;
      playing = false; queue = []; open = false; group = null;
      emit(err && err.name === "NotAllowedError" ? "blocked" : "error", g);
    });
  }
  el.addEventListener("playing", () => { if (group && !started) { started = true; emit("playing"); } else if (group) emit("resumed"); });
  el.addEventListener("ended", () => { if (group) next(); });
  el.addEventListener("error", () => { if (group && playing && el.src && el.src.startsWith("blob:")) { emit("segment_error"); next(); } });
  return {
    onEvent(fn) { listener = fn; },
    unlock,
    begin(g) { this.stop(true); group = g; open = true; started = false; },
    push(g, blob) { if (g !== group) return; queue.push(blob); if (!playing) next(); },
    end(g) { if (g !== group) return; open = false; if (!playing && !queue.length) { group = null; emit("ended", g); } },
    playList(g, blobs) { this.begin(g); blobs.forEach(b => queue.push(b)); open = false; next(); },
    stop(silent) {
      const g = group; queue = []; open = false; playing = false; group = null;
      if (url || (el.src && el.src.startsWith("blob:"))) {  // never abort the silent unlock clip
        try { el.pause(); } catch { /* */ }
        el.removeAttribute("src"); try { el.load(); } catch { /* */ }
      }
      revoke();
      if (g && !silent) emit("stopped", g);
    },
    get busy() { return !!group; },
    get group() { return group; }
  };
})();
