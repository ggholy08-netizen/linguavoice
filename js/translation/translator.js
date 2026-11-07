// Translation engine: exactly one active request at a time (a new one cancels the old one),
// WebSocket first with HTTP fallback, streamed partial results, Edge TTS audio queued in order.
// Views never talk to the network; they call Engine and listen to bus events:
//   job:new(job) job:partial(job, m) job:result(job, m) job:done(job) job:error(job, code) job:cancel(job)
//   player(type, group, job)
import { CONFIG, AppError, uid, now } from "../utils.js";
import { bus } from "../state.js";
import { Net, BACKEND, fetchTimeout, api, postJSON, unpackFrame } from "../net.js";
import { Player } from "../voice/playback.js";
import { History } from "../storage/history.js";
import { prefs } from "../storage/settings.js";
import { status, fail } from "../ui/status.js";
import { T } from "../i18n.js";
import { toast } from "../ui/notifications.js";
import { Detection } from "./language-detection.js";
import { Recorder } from "../speech/microphone.js";
import { Voices } from "../voice/tts.js";

export const Engine = {
  job: null,

  init() {
    bus.on("ws:json", m => this.onJSON(m));
    bus.on("ws:binary", ab => this.onBinary(ab));
    bus.on("ws:lost", () => this.onLost());
    Player.onEvent((type, g) => this.onPlayer(type, g));
  },

  /* ---------- job lifecycle ---------- */
  newJob(kind, extra) {
    this.cancel();
    const job = { id: uid(), kind, segments: [], gotResult: false, ttsDone: false, playStarted: false,
      abort: new AbortController(), timer: 0, m: {}, ...extra };
    this.job = job;
    this.armTimeout(job);
    bus.emit("job:new", job);
    return job;
  },
  armTimeout(job) {
    clearTimeout(job.timer);
    job.timer = setTimeout(() => { if (this.job === job) this.error(job, "timeout"); }, CONFIG.REQUEST_TIMEOUT_MS);
  },
  /** Cancel the active request (server side too) and its audio. */
  cancel() {
    const job = this.job; if (!job) return;
    this.job = null; clearTimeout(job.timer);
    try { job.abort.abort(); } catch { /* */ }
    if (Net.open) Net.send({ type: "cancel", id: job.id });
    if (Player.group === job.id) Player.stop(true);
    bus.emit("job:cancel", job);
  },
  finish(job) {
    if (this.job !== job) return;
    clearTimeout(job.timer); this.job = null;
    if (!Player.busy) status.set("ready");
    bus.emit("job:done", job);
  },
  error(job, code) {
    if (this.job !== job) return;
    clearTimeout(job.timer); this.job = null;
    if (Player.group === job.id) Player.stop(true);
    try { job.abort.abort(); } catch { /* */ }
    if (code === "timeout" && Net.open) Net.send({ type: "cancel", id: job.id });
    fail(code, String(code).startsWith("tts") && job.gotResult);
    bus.emit("job:error", job, code);
  },

  /* ---------- requests ---------- */
  /** Speech: ctx = { view, mode, speaker?, source, target }, rec = Recorder result. */
  async translateAudio(ctx, rec) {
    const job = this.newJob("translate", {
      ctx, voice: this.voiceFor(ctx.target), rate: prefs.rate, volume: prefs.volume, wantPlay: prefs.autoplay,
      m: { capture: rec.captureMs, endpoint: rec.endpointMs, tEnd: rec.tEnd }
    });
    status.set("processing");
    if (job.wantPlay) Player.begin(job.id);
    const header = { type: "translate", id: job.id, source_lang: ctx.source, target_lang: ctx.target,
      voice: job.voice, rate: job.rate, volume: job.volume, tts: true, mime: "audio/wav" };
    if (Net.open || await Net.waitOpen(2500)) {
      if (this.job !== job) return job;
      Net.sendFrame(header, rec.wav); job.m.sent = now();
    } else {
      if (this.job !== job) return job;
      job.viaHttp = true;
      this.http(job, rec.wav).catch(e => { if (this.job === job) this.error(job, e.code || "translate_failed"); });
    }
    return job;
  },

  /** Typed text: ctx = { view, mode, source, target }, plus ctx.text. */
  translateText(ctx) {
    const job = this.newJob("translate", {
      ctx: { ...ctx, typed: true }, voice: this.voiceFor(ctx.target), rate: prefs.rate, volume: prefs.volume,
      wantPlay: prefs.autoplay, m: { tEnd: now() }
    });
    status.set("translating");
    if (job.wantPlay) Player.begin(job.id);
    const msg = { type: "translate_text", id: job.id, text: ctx.text, source_lang: ctx.source, target_lang: ctx.target,
      voice: job.voice, rate: job.rate, volume: job.volume, tts: true };
    (async () => {
      if (Net.open || await Net.waitOpen(2500)) { if (this.job === job) { Net.send(msg); job.m.sent = now(); } return; }
      if (this.job !== job) return;
      job.viaHttp = true;
      await this.http(job, null);
    })().catch(e => { if (this.job === job) this.error(job, e.code || "translate_failed"); });
    return job;
  },

  /** Synthesize text again with Edge TTS (replay with another voice/speed, history playback). */
  speak({ text, lang, voice, rate = prefs.rate, volume = prefs.volume, onAudioDone, tag }) {
    Player.unlock();
    const job = this.newJob("speak", { voice: voice || this.voiceFor(lang), rate, volume, wantPlay: true, onAudioDone, lang, text, tag });
    Player.begin(job.id);
    status.set("tts");
    (async () => {
      if (Net.open || await Net.waitOpen(2500)) {
        if (this.job === job) Net.send({ type: "speak", id: job.id, text, lang, voice: job.voice, rate, volume });
        return;
      }
      job.viaHttp = true;
      const blob = await this.ttsHttp(job, text, lang);
      if (this.job !== job) return;
      this.onAudio(job, 0, blob); this.onTtsDone(job, { segments: 1 });
    })().catch(e => { if (this.job === job) this.error(job, e.code || "tts_unavailable"); });
    return job;
  },

  /** Play already-synthesized segments (no network). */
  playCached(segments, tag) {
    Player.unlock();
    this.cancel();
    const g = `cached-${tag || ""}-${uid()}`;
    Player.playList(g, segments);
    return g;
  },

  stopAudio() {
    Player.stop();
    if (this.job && this.job.kind === "speak") this.cancel();
  },

  voiceFor(lang) { return Voices.chosen(lang); },

  /* ---------- HTTP fallback ---------- */
  async http(job, wav) {
    const ctx = job.ctx;
    job.m.sent = now();
    let j;
    if (ctx.typed) {
      j = await postJSON("/api/translate_text", { text: ctx.text, source_lang: ctx.source, target_lang: ctx.target }, job.abort.signal);
    } else {
      const fd = new FormData();
      fd.append("audio", new Blob([wav], { type: "audio/wav" }), "speech.wav");
      fd.append("source_lang", ctx.source); fd.append("target_lang", ctx.target);
      const r = await fetchTimeout(api("/api/translate"), { method: "POST", body: fd, signal: job.abort.signal });
      j = await r.json().catch(() => ({}));
      if (!r.ok) throw new AppError((j.error && j.error.code) || "translate_failed");
    }
    if (this.job !== job) return;
    this.onResult(job, { ...j, voice: job.voice });
    status.set("tts");
    const t0 = now();
    const blob = await this.ttsHttp(job, j.translated_text, ctx.target);
    if (this.job !== job) return;
    job.m.ttsFirst = now() - t0;
    this.onAudio(job, 0, blob);
    this.onTtsDone(job, { segments: 1, tts_first_ms: job.m.ttsFirst });
  },
  async ttsHttp(job, text, lang) {
    const a = await fetchTimeout(api("/api/tts"), { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, lang, voice: job.voice, rate: job.rate, volume: job.volume }), signal: job.abort.signal });
    if (!a.ok) { const e = await a.json().catch(() => ({})); throw new AppError((e.error && e.error.code) || "tts_unavailable"); }
    return a.blob();
  },

  /* ---------- server messages ---------- */
  onJSON(m) {
    const job = this.job;
    if (!job || m.id !== job.id) return; // stale or unrelated
    switch (m.type) {
      case "status":
        if (m.stage === "recognizing") status.set("processing");
        else if (m.stage === "translating") status.set("translating");
        else if (m.stage === "tts" && !job.playStarted) status.set("tts");
        break;
      case "partial": if (job.kind === "translate") bus.emit("job:partial", job, m); break;
      case "result": this.onResult(job, m); break;
      case "tts_done": this.onTtsDone(job, m); break;
      case "error": this.error(job, m.code); break;
    }
  },
  onBinary(ab) {
    let fr; try { fr = unpackFrame(ab); } catch { return; }
    const job = this.job;
    if (!job || fr.header.id !== job.id) return;
    this.onAudio(job, fr.header.seq, new Blob([fr.payload], { type: fr.header.mime || "audio/mpeg" }));
  },
  onResult(job, m) {
    job.gotResult = true;
    job.m.gemini = m.timings ? m.timings.gemini_ms : null;
    job.m.geminiFirst = m.timings ? m.timings.gemini_first_token_ms : null;
    const ctx = job.ctx;
    job.result = { src: m.recognized_text, tr: m.translated_text, det: m.detected_language, voice: m.voice || job.voice };
    job.stable = Detection.observe(m.detected_language, m.recognized_text);
    if (!job.playStarted && status.kind !== "playing") status.set("tts");
    this.armTimeout(job); // fresh timeout for the voice
    job.record = {
      id: job.id, ts: Date.now(), mode: ctx.mode, input: ctx.typed ? "text" : "voice", speaker: ctx.speaker || null,
      src: m.detected_language, tgt: ctx.target, source_text: m.recognized_text, translated_text: m.translated_text, fav: 0
    };
    if (prefs.saveHistory && m.recognized_text) History.put(job.record).catch(() => toast(T.err.storage, { type: "error" }));
    bus.emit("job:result", job, m);
  },
  onAudio(job, seq, blob) {
    job.segments[seq] = blob;
    if (job.wantPlay) Player.push(job.id, blob);
  },
  onTtsDone(job, m) {
    job.ttsDone = true;
    if (m.tts_first_ms != null) job.m.ttsFirst = m.tts_first_ms;
    job.audio = job.segments.filter(Boolean);
    if (job.kind === "speak" && job.onAudioDone) job.onAudioDone(job.audio);
    if (job.wantPlay) Player.end(job.id);
    this.finish(job);
  },
  onLost() {
    const job = this.job;
    // the server cannot finish a WebSocket job whose connection is gone
    if (job && !job.viaHttp && !job.ttsDone) this.error(job, "ws_lost");
  },

  /* ---------- playback events ---------- */
  onPlayer(type, g) {
    const job = this.job && this.job.id === g ? this.job : null;
    if (type === "playing") {
      status.set("playing");
      if (job) { job.playStarted = true; if (job.kind === "translate" && job.m.tEnd && !job.m.total) job.m.total = now() - job.m.tEnd; }
    } else if (type === "drain") {
      if (job && !job.ttsDone) status.set("tts");
    } else if (type === "ended" || type === "stopped") {
      if (!this.job && !Recorder.active) status.set("ready");
    } else if (type === "blocked") {
      status.set("ready"); toast(T.err.playback_blocked, { ms: 5000 });
    } else if (type === "error" || type === "segment_error") {
      toast(T.err.playback_failed, { type: "error" });
    }
    bus.emit("player", type, g, job);
  },

  get configured() { return BACKEND.ok; }
};
