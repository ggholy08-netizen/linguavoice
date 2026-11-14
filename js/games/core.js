// Shared game engine: progress (XP, levels, daily streak, per-game stats), the language pair and difficulty,
// content loading (built-in or Gemini), microphone capture, Edge TTS playback and the common screens.
import { $, esc, AppError, uid, reduceMotion, replay } from "../utils.js";
import { T, langName, LANG } from "../i18n.js";
import { bus } from "../state.js";
import { store, prefs } from "../storage/settings.js";
import { BACKEND, api, fetchTimeout, postJSON } from "../net.js";
import { Recorder } from "../speech/microphone.js";
import { Recognition, missingFeatures } from "../speech/recognition.js";
import { Player } from "../voice/playback.js";
import { Engine } from "../translation/translator.js";
import { Voices } from "../voice/tts.js";
import { toast } from "../ui/notifications.js";
import { hasBuiltin, builtinItems } from "./content.js";

/* ---------------- text ---------------- */
export const G = {
  levels: { easy: "Оңай", medium: "Орта", hard: "Қиын" },
  err: {
    bad_model_output: "Gemini толық емес жауап қайтарды. Қайталап көріңіз.",
    gemini_bad_request: "Gemini сұрауды қабылдамады. Қайталап көріңіз.",
    bad_audio: "Дыбыс пішімі қолдау көрсетілмейді.",
    no_speech: "Сөз анықталмады. Микрофонға жақынырақ, анығырақ сөйлеңіз.",
    bad_request: "Сервер ойындарды әлі білмейді. Render-де серверді жаңартыңыз (Manual Deploy).",
    generic: "Тапсырманы орындау мүмкін болмады. Қайталап көріңіз."
  },
  needServer: "Бұл ойынға сервер (Gemini) қажет.",
  needMic: "Бұл ойынға микрофон қажет.",
  loading: "Тапсырмалар дайындалуда…",
  checking: "Gemini тексеріп жатыр…",
  retry: "Қайталау",
  back: "Ойындар",
  next: "Келесі",
  finish: "Аяқтау",
  again: "Қайта ойнау",
  listen: "Тыңдау",
  slow: "Баяу",
  speakNow: "Басып, сөйлеңіз",
  stopRec: "Тоқтату",
  newRecord: "Жаңа рекорд!",
  wordMatchNote: "Бұл — Gemini жазып алған сөздер мен үлгінің сәйкестігі, дыбыстаудың фонетикалық бағасы емес."
};
export const gameErr = code => G.err[code] || T.err[code] || G.err.generic;

/* ---------------- settings: language pair + difficulty ---------------- */
const DEFAULT_PAIR = { know: "kk", learn: "en", level: "easy", fresh: false };
export const Pair = {
  get() { return { ...DEFAULT_PAIR, ...store.get("gamePair", {}) }; },
  set(patch) { const p = { ...this.get(), ...patch }; store.set("gamePair", p); bus.emit("game:pair", p); return p; },
  builtin(p = this.get()) { return hasBuiltin(p.know, p.learn); }
};

/* ---------------- progress ---------------- */
export const DAILY_GOAL = 50;
const dayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const daysBetween = (a, b) => Math.round((new Date(b + "T12:00:00") - new Date(a + "T12:00:00")) / 86400000);
const xpFor = n => 50 * (n - 1) * n; // total XP needed to reach level n: 2→100, 3→300, 4→600, 5→1000

export const Stats = {
  load() {
    const s = store.get("games", null) || {};
    return { xp: 0, streak: 0, lastDay: "", bestStreak: 0, days: {}, games: {}, ...s };
  },
  save(s) { store.set("games", s); bus.emit("game:stats", s); },
  level(xp) {
    let n = 1; while (xp >= xpFor(n + 1)) n++;
    const a = xpFor(n), b = xpFor(n + 1);
    return { level: n, into: xp - a, need: b - a, pct: Math.round(((xp - a) / (b - a)) * 100) };
  },
  /** current streak, counting today as still open */
  streakNow(s = this.load()) {
    if (!s.lastDay) return 0;
    const gap = daysBetween(s.lastDay, dayKey());
    return gap <= 1 ? s.streak : 0;
  },
  today(s = this.load()) { return s.days[dayKey()] || 0; },
  /** record a finished game. r = { score, correct, total, xp } → returns { xp, newBest, levelUp, streak } */
  add(gameId, r) {
    const s = this.load();
    const before = this.level(s.xp).level;
    const xp = Math.max(0, Math.round(r.xp || 0));
    s.xp += xp;
    const today = dayKey();
    s.days[today] = (s.days[today] || 0) + xp;
    // keep the last 60 days only
    Object.keys(s.days).sort().slice(0, -60).forEach(k => delete s.days[k]);
    if (xp > 0 && s.lastDay !== today) {
      s.streak = s.lastDay && daysBetween(s.lastDay, today) === 1 ? s.streak + 1 : 1;
      s.lastDay = today;
      s.bestStreak = Math.max(s.bestStreak || 0, s.streak);
    }
    const g = s.games[gameId] || { plays: 0, best: 0, correct: 0, total: 0, last: 0 };
    g.plays++; g.correct += r.correct || 0; g.total += r.total || 0; g.last = Date.now();
    const newBest = (r.score || 0) > g.best && g.plays > 1;
    g.best = Math.max(g.best, r.score || 0);
    s.games[gameId] = g;
    this.save(s);
    return { xp, newBest, levelUp: this.level(s.xp).level > before, level: this.level(s.xp).level, streak: s.streak };
  },
  reset() { store.set("games", null); store.set("cards", null); bus.emit("game:stats", this.load()); },
  week(s = this.load()) {
    const out = [];
    for (let i = 6; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - i); const k = dayKey(d); out.push({ k, d, xp: s.days[k] || 0 }); }
    return out;
  }
};

/* ---------------- session: timers, abort, cleanup ---------------- */
export function session() {
  const ctl = new AbortController();
  const timers = new Set();
  const cleanups = new Set();
  let alive = true;
  const s = {
    id: uid(), signal: ctl.signal,
    alive: () => alive,
    later(fn, ms) { const t = setTimeout(() => { timers.delete(t); if (alive) fn(); }, ms); timers.add(t); return t; },
    every(fn, ms) { const t = setInterval(() => { if (alive) fn(); }, ms); timers.add(t); return t; },
    clear(t) { clearTimeout(t); clearInterval(t); timers.delete(t); },
    /** run fn when the game is left (camera off, listeners removed…). Returns a function that un-registers it. */
    onEnd(fn) { cleanups.add(fn); return () => cleanups.delete(fn); },
    end() {
      if (!alive) return;
      alive = false;
      timers.forEach(t => { clearTimeout(t); clearInterval(t); });
      timers.clear();
      try { ctl.abort(); } catch { /* */ }
      cleanups.forEach(fn => { try { fn(); } catch { /* */ } });
      cleanups.clear();
      if (Recorder.active) Recorder.cancel();
      stopSpeech();
    }
  };
  return s;
}

/**
 * A countdown that drives a bar smoothly: the bar is scaled on every animation frame (transform only), the time
 * itself comes from the clock, so it stays exact even if frames are dropped or the tab was in the background.
 * opts: { lowAt (seconds → adds class "low"), onTick(secondsLeft), onEnd() }. Returns { stop(), left() }.
 */
export function countdown(s, bar, seconds, { lowAt = 3, onTick, onEnd } = {}) {
  const t0 = performance.now();
  let raf = 0, done = false, shown = -1;
  const left = () => Math.max(0, seconds - (performance.now() - t0) / 1000);
  const stop = () => { done = true; cancelAnimationFrame(raf); off(); };
  const off = s.onEnd(() => { done = true; cancelAnimationFrame(raf); });
  const frame = () => {
    if (done || !s.alive()) return;
    const l = left();
    if (bar && bar.isConnected) {
      bar.style.transform = `scaleX(${(l / seconds).toFixed(4)})`;
      bar.classList.toggle("low", l < lowAt);
    }
    const whole = Math.ceil(l);
    if (whole !== shown) { shown = whole; onTick && onTick(whole); }
    if (l <= 0) { stop(); onEnd && onEnd(); return; }
    raf = requestAnimationFrame(frame);
  };
  frame();
  return { stop, left };
}

/** Count a number up inside an element (results screen). Jumps straight to the value if motion is reduced. */
export function countUp(el, to, ms = 700) {
  if (!el) return;
  if (reduceMotion() || !to) { el.textContent = to; return; }
  const t0 = performance.now();
  const step = t => {
    if (!el.isConnected) return;
    const k = Math.min(1, (t - t0) / ms), e = 1 - Math.pow(1 - k, 3);
    el.textContent = Math.round(to * e);
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/** FLIP: move an element in the DOM (inside `change`) and let it glide from where it was to where it is now. */
export function flip(el, change, { ms = 280 } = {}) {
  const a = el.getBoundingClientRect();
  change();
  if (reduceMotion() || !el.animate) return;
  const b = el.getBoundingClientRect();
  const dx = a.left - b.left, dy = a.top - b.top;
  if (!dx && !dy) return;
  el.getAnimations().forEach(x => x.cancel());
  el.animate([{ transform: `translate(${dx}px, ${dy}px) scale(1.08)` }, { transform: "none" }], { duration: ms, easing: "cubic-bezier(.22,.8,.26,1)" });
}

/* ---------------- network ---------------- */
export async function postForm(path, fd, signal, ms = 45000) {
  const r = await fetchTimeout(api(path), { method: "POST", body: fd, signal }, ms);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new AppError((j.error && j.error.code) || (r.status === 404 ? "bad_request" : "generic"));
  return j;
}

/** Items for a game: built-in for kk/ru/en (unless "fresh" is on), otherwise generated by Gemini. */
export async function loadItems(s, kind, n, p = Pair.get()) {
  if (Pair.builtin(p) && !p.fresh) return builtinItems(kind, p.know, p.learn, p.level, n);
  if (!BACKEND.ok) throw new AppError(BACKEND.code);
  if (navigator.onLine === false) throw new AppError("no_internet");
  const j = await postJSON("/api/game/generate", { kind, know: p.know, learn: p.learn, level: p.level, n }, s.signal, 60000);
  if (!Array.isArray(j.items) || !j.items.length) throw new AppError("bad_model_output");
  return j.items;
}

export function checkVoice(s, wav, meta) {
  const fd = new FormData();
  fd.append("audio", new Blob([wav], { type: "audio/wav" }), "speech.wav");
  fd.append("meta", JSON.stringify(meta));
  return postForm("/api/game/voice", fd, s.signal);
}

export function roleplay(s, meta, wav) {
  const fd = new FormData();
  fd.append("meta", JSON.stringify(meta));
  if (wav) fd.append("audio", new Blob([wav], { type: "audio/wav" }), "speech.wav");
  return postForm("/api/game/roleplay", fd, s.signal, 60000);
}

/* ---------------- microphone ---------------- */
export const micProblem = () => missingFeatures() || (!BACKEND.ok ? BACKEND.code : null);

/**
 * Record one phrase with the shared Recorder (same endpointing as the translator).
 * btn gets data-state listening|idle and --level for the animation. Resolves with the Recorder result or null.
 */
export function recordPhrase(btn, s, { maxMs = 20000 } = {}) {
  return new Promise(resolve => {
    stopSpeech();
    if (Recognition.active) Recognition.cancel();
    const problem = micProblem();
    if (problem) { toast(gameErr(problem), { type: "error" }); resolve(null); return; }
    let settled = false, cap = 0;
    const finish = v => {
      if (settled) return; settled = true;
      s.clear(cap);
      if (btn) { btn.dataset.state = "idle"; btn.dataset.speech = "0"; btn.style.setProperty("--level", "0"); }
      resolve(v);
    };
    if (btn) btn.dataset.state = "listening";
    cap = s.later(() => Recorder.stop(), maxMs);
    Recorder.start({
      silenceMs: Math.max(prefs.silenceMs, 650),
      onLevel: lv => btn && btn.style.setProperty("--level", lv.toFixed(2)),
      onSpeech: on => { if (btn) btn.dataset.speech = on ? "1" : "0"; },
      onEnd: res => {
        if (res.reason === "cancel") finish(null);
        else if (res.reason === "no_speech") { toast(gameErr("no_speech"), { type: "error" }); finish(null); }
        else finish(res);
      }
    }).then(() => { if (!s.alive()) Recorder.cancel(); })
      .catch(e => { toast(gameErr(e.code || "mic_failed"), { type: "error" }); finish(null); });
  });
}
export const stopRecording = () => { if (Recorder.active) Recorder.stop(); };
export const recording = () => Recorder.active;

/* ---------------- Edge TTS ---------------- */
const ttsCache = new Map();
let speaking = null;
export function stopSpeech() {
  if (speaking) { const f = speaking; speaking = null; f(false); }
  if (Player.busy) Player.stop(true);
  if (Engine.job && Engine.job.kind === "speak") Engine.cancel();
}
/** Speak text with Edge TTS and resolve when playback ends (true) or fails / is stopped (false). */
export function say(text, lang, { rate = 0 } = {}) {
  return new Promise(resolve => {
    if (!text || !BACKEND.ok) { resolve(false); return; }
    if (!Voices.hasVoice(lang)) { toast(T.err.tts_no_voice, { type: "error" }); resolve(false); return; }
    stopSpeech();
    const voice = Voices.chosen(lang);
    const key = [lang, voice, rate, prefs.volume, text].join("|");
    let g = null;
    const offs = [];
    const done = ok => { offs.forEach(f => f()); if (speaking === done) speaking = null; resolve(ok); };
    speaking = done;
    offs.push(bus.on("player", (type, grp) => {
      if (grp === g && ["ended", "stopped", "error", "blocked"].includes(type)) done(type === "ended");
    }));
    const cached = ttsCache.get(key);
    if (cached) { g = Engine.playCached(cached, "game"); return; }
    const job = Engine.speak({
      text, lang, voice, rate, volume: prefs.volume, tag: "game",
      onAudioDone: segs => {
        if (!segs.length) return;
        ttsCache.set(key, segs);
        if (ttsCache.size > 60) ttsCache.delete(ttsCache.keys().next().value);
      }
    });
    g = job.id;
    offs.push(bus.on("job:error", j => { if (j === job) done(false); }));
    offs.push(bus.on("job:cancel", j => { if (j === job) done(false); }));
  });
}

/* ---------------- small UI helpers ---------------- */
export const ICON = {
  play: '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4.5v15l13-7.5z"/></svg>',
  slow: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2M10 2h4"/></svg>',
  mic: '<svg class="ico-mic" width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7"/></svg>' +
    '<svg class="ico-stop" width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="3"/></svg>',
  back: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>',
  send: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14"/><path d="m13 6 6 6-6 6"/></svg>'
};

export const micBtnHTML = (id, label = G.speakNow) =>
  `<button class="mic gmic" id="${id}" data-state="idle" data-speech="0" aria-label="${esc(label)}">${ICON.mic}</button>`;

export const pairLine = p => `${esc(langName(p.know))} → ${esc(langName(p.learn))} · ${esc(G.levels[p.level])}`;

/** Common frame: back button, title, score, progress bar and the stage. Returns element refs. */
export function frame(root, game, { total = 0 } = {}) {
  root.innerHTML = `
    <div class="g-top">
      <a class="btn ghost-btn g-back" href="#/games">${ICON.back}${esc(G.back)}</a>
      <h1 class="g-title"><span aria-hidden="true">${game.emoji}</span> ${esc(game.title)}</h1>
      <span class="g-score" aria-live="polite"><b id="gScore">0</b><small>ұпай</small></span>
    </div>
    <div class="g-meta"><span>${pairLine(Pair.get())}</span><span id="gStep"></span></div>
    <div class="g-progress" aria-hidden="true"><i id="gBar"></i></div>
    <div class="g-stage card glass" id="gStage"></div>`;
  const ui = {
    stage: $("gStage"),
    setScore(v) { const el = $("gScore"); if (String(v) !== el.textContent) { el.textContent = v; replay(el, "bump"); } },
    setStep(i, n = total) {
      $("gStep").textContent = n ? `${Math.min(i + 1, n)} / ${n}` : "";
      $("gBar").style.setProperty("--prog", n ? (i / n).toFixed(3) : "0");
    }
  };
  ui.setStep(0);
  return ui;
}

export function loadingHTML(text = G.loading) {
  return `<div class="g-loading"><span class="spinner" aria-hidden="true"></span><p>${esc(text)}</p></div>`;
}

export function errorHTML(code, { retryId = "gRetry" } = {}) {
  return `<div class="g-error" role="alert"><p>${esc(gameErr(code))}</p>
    <button class="btn primary" id="${retryId}">${esc(G.retry)}</button></div>`;
}

/**
 * Results screen. r = { score, correct, total, xp, extraHTML, review: [{q, a, ok}] }
 * Records the result in the stats and renders it.
 */
export function showResult(root, game, r, { onAgain } = {}) {
  const res = Stats.add(game.id, r);
  const acc = r.total ? Math.round((r.correct / r.total) * 100) : null;
  const g = Stats.load().games[game.id] || {};
  root.querySelector("#gBar") && root.querySelector("#gBar").style.setProperty("--prog", "1");
  const stage = root.querySelector("#gStage") || root;
  stage.innerHTML = `
    <div class="g-result">
      <div class="g-trophy" aria-hidden="true">${r.score >= (r.max || 1) * 0.7 ? "🏆" : r.score > 0 ? "⭐" : "💪"}</div>
      <div class="g-big"><span id="gBig">${r.score}</span><small> ұпай</small></div>
      ${res.newBest ? `<p class="g-badge">${esc(G.newRecord)}</p>` : ""}
      <dl class="g-kv">
        <div><dt>Тәжірибе</dt><dd>+${res.xp} XP</dd></div>
        ${acc !== null ? `<div><dt>Дәлдік</dt><dd>${acc}%</dd></div>` : ""}
        <div><dt>Рекорд</dt><dd>${g.best || r.score}</dd></div>
        <div><dt>Серия</dt><dd>🔥 ${res.streak || Stats.streakNow()}</dd></div>
      </dl>
      ${res.levelUp ? `<p class="g-badge violet">Жаңа деңгей: ${res.level}!</p>` : ""}
      ${r.extraHTML || ""}
      ${r.review && r.review.length ? `<details class="g-review"><summary>Қателерді қарау (${r.review.filter(x => !x.ok).length})</summary>
        <ul>${r.review.map(x => `<li class="${x.ok ? "ok" : "bad"}"><span>${esc(x.q)}</span><b>${esc(x.a)}</b>${x.note ? `<small>${esc(x.note)}</small>` : ""}</li>`).join("")}</ul></details>` : ""}
      <div class="g-actions">
        <button class="btn primary" id="gAgain">${esc(G.again)}</button>
        <a class="btn" href="#/games">${esc(G.back)}</a>
      </div>
    </div>`;
  [...stage.querySelector(".g-result").children].forEach((c, i) => c.style.setProperty("--i", i));
  countUp(stage.querySelector("#gBig"), r.score);
  stage.querySelector("#gAgain").onclick = () => onAgain && onAgain();
}

export const verdictLabel = v => ({ correct: "Дұрыс", partial: "Жартылай дұрыс", wrong: "Қате", no_speech: "Сөз жоқ" }[v] || v);
export const langLabel = c => (LANG[c] ? LANG[c].kk : c);
/** "Ағылшын тілі" → "Ағылшын", so that texts can say "Ағылшын тіліне" / "Ағылшын тілінде". */
export const langStem = c => langName(c).replace(/\s+тілі$/, "");
