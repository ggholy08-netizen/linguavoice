// Main screen: language bar with AUTO LANGUAGE, source text (typed or recognised), translation,
// Edge TTS controls (voice by accent / gender, speed, volume), favourites, speed metrics.
import { $, esc, MAX_TEXT_CHARS } from "../utils.js";
import { T, LANG, langName } from "../i18n.js";
import { bus } from "../state.js";
import { prefs, savePref } from "../storage/settings.js";
import { Engine } from "../translation/translator.js";
import { Detection } from "../translation/language-detection.js";
import { Recognition } from "../speech/recognition.js";
import { Voices } from "../voice/tts.js";
import { Player } from "../voice/playback.js";
import { History } from "../storage/history.js";
import { BACKEND } from "../net.js";
import { pickLanguage, copyText, blurOnPhone, pop } from "../ui/components.js";
import { toast } from "../ui/notifications.js";
import { fail } from "../ui/status.js";

const VIEW = "translate";
let last = null; // { id, text, lang, segments, voice, rate, volume, complete, source, src, record, fav }

const signed = v => (v > 0 ? "+" : "") + v + "%";
const mine = job => job && job.ctx && job.ctx.view === VIEW;

export const Dashboard = {
  init() {
    $("srcBtn").onclick = () => pickLanguage({
      title: T.pickSrc, current: prefs.src, allowAuto: true,
      onPick: code => this.setSource(code)
    });
    $("tgtBtn").onclick = () => pickLanguage({
      title: T.pickTgt, current: prefs.tgt, needsVoice: true,
      onPick: code => {
        if (code === prefs.src) this.setSource(prefs.tgt);
        if (code === prefs.manualSrc) savePref("manualSrc", prefs.tgt);
        savePref("tgt", code); last = null; this.render(); this.updatePlay();
      }
    });
    $("autoToggle").onchange = e => this.setSource(e.target.checked ? "auto" : (prefs.manualSrc || Detection.stable || "kk"));
    $("swapBtn").onclick = () => this.swap();

    const ta = $("srcText");
    ta.addEventListener("input", () => this.onSrcInput());
    ta.addEventListener("keydown", e => {
      if (e.key === "Enter" && !e.shiftKey && !e.isComposing && e.keyCode !== 229) { e.preventDefault(); this.translateTyped(); }
    });
    $("translateBtn").onclick = () => this.translateTyped();
    $("clearSrc").onclick = () => { this.setSrc(""); ta.focus(); };
    $("copySrc").onclick = () => copyText(ta.value.trim());
    $("copyTgt").onclick = () => copyText($("tgtText").textContent);
    $("favTgt").onclick = () => this.toggleFav();
    $("playBtn").onclick = () => this.play(false);
    $("replayBtn").onclick = () => this.play(true);

    $("voiceSel").onchange = e => Voices.choose(prefs.tgt, e.target.value);
    document.querySelectorAll("#genderSeg button").forEach(b => b.onclick = () => { savePref("voiceGender", b.dataset.g); this.renderVoices(); });
    $("rateRange").value = prefs.rate; $("rateOut").textContent = signed(prefs.rate);
    $("rateRange").oninput = e => { const v = +e.target.value; $("rateOut").textContent = signed(v); savePref("rate", v); };
    $("volRange").value = prefs.volume; $("volOut").textContent = signed(prefs.volume);
    $("volRange").oninput = e => { const v = +e.target.value; $("volOut").textContent = signed(v); savePref("volume", v); };

    bus.on("voices", () => { this.render(); });
    bus.on("pref", k => { if (k === "metrics") this.renderMetricsVisibility(); });
    bus.on("job:new", job => this.onJobNew(job));
    bus.on("job:partial", (job, m) => this.onPartial(job, m));
    bus.on("job:result", (job, m) => this.onResult(job, m));
    bus.on("job:done", job => this.onDone(job));
    bus.on("job:error", job => { if (mine(job)) { $("tgtText").classList.remove("live"); this.updatePlay(); } });
    bus.on("job:cancel", job => { if (mine(job)) $("tgtText").classList.remove("live"); this.updatePlay(); });
    bus.on("player", () => this.updatePlay());

    this.render();
    this.onSrcInput();
    this.renderMetricsVisibility();
  },

  /* ---------- languages ---------- */
  setSource(code) {
    if (code !== "auto") savePref("manualSrc", code);
    if (code === prefs.tgt) { const t = prefs.tgt; savePref("tgt", prefs.src !== "auto" ? prefs.src : (t === "en" ? "kk" : "en")); }
    savePref("src", code);
    this.render();
  },
  render() {
    const auto = prefs.src === "auto";
    $("srcName").textContent = auto ? T.autoShort : langName(prefs.src);
    $("tgtName").textContent = langName(prefs.tgt);
    $("autoToggle").checked = auto;
    $("autoState").textContent = auto ? "ON" : "OFF";
    const st = Detection.stable;
    $("autoNote").textContent = auto && st && LANG[st] ? T.stableLang(langName(st)) : "";
    this.renderVoices();
  },
  swap() {
    let newTgt = prefs.src;
    if (prefs.src === "auto") {
      const d = Detection.stable;
      if (d && LANG[d] && d !== prefs.tgt) newTgt = d;
      else { toast(T.err.swap_need_lang); return; }
    }
    const oldTgt = prefs.tgt;
    savePref("manualSrc", oldTgt);
    savePref("src", oldTgt); savePref("tgt", newTgt);
    if (!Voices.hasVoice(newTgt)) toast(T.err.no_voice_for_target, { type: "error" });
    const s = $("srcText").value, t = $("tgtText").textContent;
    if (s || t) { this.setSrc(t); $("tgtText").textContent = s; last = null; this.updatePlay(); }
    $("detChip").hidden = true;
    $("swapBtn").classList.toggle("spin");
    this.render();
  },

  /* ---------- voice controls ---------- */
  renderVoices() {
    const lang = prefs.tgt, g = Voices.gendersFor(lang);
    let gender = prefs.voiceGender;
    if ((gender === "female" && !g.female) || (gender === "male" && !g.male)) gender = "all";
    document.querySelectorAll("#genderSeg button").forEach(b => {
      const avail = b.dataset.g === "all" || (b.dataset.g === "female" ? g.female : g.male);
      b.disabled = Voices.list.length > 0 && !avail;
      b.setAttribute("aria-pressed", String(b.dataset.g === gender));
    });
    const sel = $("voiceSel");
    sel.innerHTML = Voices.optionsHTML(lang, gender, esc);
    const chosen = Voices.chosen(lang);
    sel.value = [...sel.options].some(o => o.value === chosen) ? chosen : "auto";
    $("voiceNote").textContent = Voices.list.length && !Voices.forLang(lang).length ? T.err.tts_no_voice : "";
  },

  /* ---------- source text ---------- */
  setSrc(text) { $("srcText").value = text || ""; this.onSrcInput(); },
  onSrcInput() {
    const el = $("srcText"), len = el.value.length;
    el.style.height = "auto"; el.style.height = Math.max(el.scrollHeight, 56) + "px";
    $("translateBtn").disabled = !el.value.trim();
    if (!last || el.value.trim() !== last.source) $("detChip").hidden = true; // stale after editing
    $("clearSrc").hidden = !len;
    const c = $("srcCount");
    c.hidden = len < MAX_TEXT_CHARS * 0.8;
    c.textContent = `${len} / ${MAX_TEXT_CHARS}`;
    c.classList.toggle("over", len >= MAX_TEXT_CHARS);
  },
  translateTyped() {
    const el = $("srcText"), text = el.value.trim();
    if (!text) { toast(T.err.empty_text); el.focus(); return; }
    if (text.length > MAX_TEXT_CHARS) { fail("text_too_long"); return; }
    if (!BACKEND.ok) { fail(BACKEND.code); return; }
    if (navigator.onLine === false) { fail("no_internet"); return; }
    Player.unlock(); // inside the click/keypress: allows audio on iOS
    if (Recognition.active) Recognition.cancel();
    const source = prefs.src, target = prefs.tgt;
    if (!Voices.hasVoice(target)) { fail("no_voice_for_target"); return; }
    const j = Engine.job;
    if (j && mine(j) && j.ctx.typed && j.ctx.text === text && j.ctx.source === source && j.ctx.target === target) return; // already on it
    if (!j && last && last.complete && last.source === text && last.src === source && last.lang === target && $("tgtText").textContent === last.text) {
      this.play(true); return; // same text again: no new request, just play it
    }
    blurOnPhone(el); // hide the phone keyboard so the result is visible
    Engine.translateText({ view: VIEW, mode: "translate", source, target, text });
  },

  /** Microphone for this screen (called from the dock). */
  mic() { Recognition.toggle({ view: VIEW, mode: "translate", source: prefs.src, target: prefs.tgt }); },

  /* ---------- job events ---------- */
  onJobNew(job) {
    if (!mine(job)) return;
    if (!job.ctx.typed) this.setSrc("");
    $("tgtText").textContent = ""; $("detChip").hidden = true; $("tgtChip").hidden = true;
    last = null; this.updatePlay(); this.renderMetrics(job);
  },
  onPartial(job, m) {
    if (!mine(job)) return;
    if (m.recognized_text && !job.ctx.typed) this.setSrc(m.recognized_text);
    if (m.translated_text) { $("tgtText").textContent = m.translated_text; $("tgtText").classList.add("live"); }
  },
  onResult(job, m) {
    if (!mine(job)) return;
    const ctx = job.ctx, det = m.detected_language;
    $("tgtText").classList.remove("live");
    if (!ctx.typed) this.setSrc(m.recognized_text);
    $("tgtText").textContent = m.translated_text;
    $("detChip").textContent = ctx.source === "auto" ? T.autoDetected(langName(det)) : langName(det);
    $("detChip").hidden = !det || det === "und";
    $("detChip").title = ctx.source === "auto" ? `Анықталды: ${langName(det)}` : "";
    $("tgtChip").textContent = langName(ctx.target); $("tgtChip").hidden = false;
    last = { id: job.id, text: m.translated_text, lang: ctx.target, segments: [], voice: job.voice, rate: job.rate,
      volume: job.volume, complete: false, source: m.recognized_text, src: ctx.source, record: job.record, fav: false };
    this.render(); this.renderFav(); this.renderMetrics(job); this.updatePlay();
  },
  onDone(job) {
    if (mine(job) && last && last.id === job.id) { last.segments = job.audio || []; last.complete = true; this.renderMetrics(job); }
    if (job.kind === "speak" && job.tag === VIEW && last) {
      Object.assign(last, { segments: job.audio || [], voice: job.voice, rate: job.rate, volume: job.volume, complete: true });
    }
    this.updatePlay();
  },

  /* ---------- playback ---------- */
  updatePlay() {
    const hasText = !!$("tgtText").textContent && !$("tgtText").classList.contains("live");
    const j = Engine.job;
    const playingMine = Player.busy && (!j || j.kind !== "translate" || mine(j));
    $("playBtn").disabled = !hasText && !playingMine;
    $("replayBtn").disabled = !hasText;
    $("playLabel").textContent = playingMine ? T.stop : T.playLbl;
    $("icoPlay").hidden = playingMine; $("icoStop").hidden = !playingMine;
    $("favTgt").disabled = !last;
  },
  play(replay) {
    Player.unlock();
    if (!replay && Player.busy) { Engine.stopAudio(); this.updatePlay(); return; }
    const text = $("tgtText").textContent; if (!text) return;
    const voice = Voices.chosen(prefs.tgt), rate = prefs.rate, volume = prefs.volume;
    if (last && last.complete && last.segments.length && last.text === text && last.voice === voice && last.rate === rate &&
        last.volume === volume && last.lang === prefs.tgt) {
      if (Recognition.active) Recognition.cancel();
      Engine.playCached(last.segments, VIEW); this.updatePlay(); return;
    }
    // voice / speed / volume changed (or nothing cached): synthesize again with Edge TTS
    const lang = (last && last.lang) || prefs.tgt;
    if (Recognition.active) Recognition.cancel();
    Engine.speak({ text, lang, voice, rate, volume, tag: VIEW });
  },

  /* ---------- favourites ---------- */
  async toggleFav() {
    if (!last || !last.record) return;
    last.fav = !last.fav;
    await History.setFav(last.id, last.fav, last.record);
    this.renderFav();
    if (last.fav) pop($("favTgt"));
    toast(last.fav ? T.favAdded : T.favRemoved, { type: "success", ms: 1800 });
    bus.emit("history:changed");
  },
  renderFav() {
    const on = !!(last && last.fav);
    $("favTgt").classList.toggle("on", on);
    $("favTgt").setAttribute("aria-pressed", String(on));
  },

  /* ---------- metrics ---------- */
  renderMetricsVisibility() { $("metrics").hidden = !prefs.metrics; },
  renderMetrics(job) {
    const m = job.m || {}, f = v => (v == null || isNaN(v)) ? "—" : T.ms(v);
    $("mCapture").textContent = f(m.capture);
    $("mEndpoint").textContent = m.endpoint ? f(m.endpoint) : (m.capture ? T.manual : "—");
    $("mGemini").textContent = m.gemini != null ? `${f(m.geminiFirst)} / ${f(m.gemini)}` : "—";
    $("mTts").textContent = f(m.ttsFirst);
    $("mTotal").textContent = m.total ? f(m.total + (m.endpoint || 0)) : "—";
  }
};

// total time is known only when playback starts
bus.on("player", (type, _g, job) => { if (type === "playing" && mine(job)) Dashboard.renderMetrics(job); });
