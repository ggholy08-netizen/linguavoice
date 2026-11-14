// Microphone capture with voice-activity endpointing (ported unchanged from v1).
// Records only after an explicit tap; the microphone is released as soon as the phrase ends.
// Output: 16 kHz mono 16-bit WAV of just the spoken phrase (+250 ms before, +200 ms after).
import { CONFIG, AppError, now } from "../utils.js";

export const Recorder = (() => {
  let ctx = null, workletPromise = null, cur = null;
  const WORKLET = "class C extends AudioWorkletProcessor{constructor(){super();this.b=new Float32Array(1024);this.n=0}" +
    "process(i){const c=i[0]&&i[0][0];if(c){for(let k=0;k<c.length;k++){this.b[this.n++]=c[k];if(this.n===1024){this.port.postMessage(this.b,[this.b.buffer]);this.b=new Float32Array(1024);this.n=0}}}return true}}" +
    "registerProcessor('lv-capture',C);";

  function audioCtx() {
    if (!ctx) { const AC = window.AudioContext || window.webkitAudioContext; ctx = new AC({ latencyHint: "interactive" }); }
    return ctx;
  }
  async function unlock() { const c = audioCtx(); if (c.state !== "running") { try { await c.resume(); } catch { /* ignore */ } } }

  async function start(opts) {
    if (cur) cancel();
    const c = audioCtx();
    await unlock();
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true }
      });
    } catch (e) {
      const n = e && e.name;
      if (n === "NotAllowedError" || n === "SecurityError" || n === "PermissionDeniedError") throw new AppError("mic_denied");
      if (n === "NotFoundError" || n === "DevicesNotFoundError" || n === "OverconstrainedError") throw new AppError("mic_notfound");
      if (n === "NotReadableError" || n === "TrackStartError" || n === "AbortError") throw new AppError("mic_busy");
      throw new AppError("mic_failed");
    }
    if (c.state !== "running") { try { await c.resume(); } catch { /* ignore */ } }
    const src = c.createMediaStreamSource(stream);
    const sink = c.createGain(); sink.gain.value = 0; sink.connect(c.destination);
    const rec = {
      opts, stream, src, sink, node: null, sr: c.sampleRate, frames: [], total: 0, offset: 0,
      speechStart: -1, lastVoice: -1, lastVoiceWall: 0, above: 0, noise: 0.004, startedAt: now(), done: false
    };
    cur = rec;
    let node = null;
    if (c.audioWorklet && window.AudioWorkletNode) {
      try {
        if (!workletPromise) {
          const url = URL.createObjectURL(new Blob([WORKLET], { type: "application/javascript" }));
          workletPromise = c.audioWorklet.addModule(url);
        }
        await workletPromise;
        node = new AudioWorkletNode(c, "lv-capture");
        node.port.onmessage = e => onFrame(rec, e.data);
      } catch { node = null; workletPromise = null; }
    }
    if (!node) {
      node = c.createScriptProcessor(2048, 1, 1);
      node.onaudioprocess = e => onFrame(rec, new Float32Array(e.inputBuffer.getChannelData(0)));
    }
    rec.node = node;
    src.connect(node); node.connect(sink);
    if (rec.done) teardown(rec); // cancelled while starting
  }

  function onFrame(rec, f) {
    if (rec.done) return;
    rec.frames.push(f); rec.total += f.length;
    let sum = 0; for (let i = 0; i < f.length; i++) sum += f[i] * f[i];
    const rms = Math.sqrt(sum / f.length);
    const thr = Math.max(0.012, rec.noise * 3.2);
    const t = now();
    rec.opts.onLevel && rec.opts.onLevel(Math.min(1, rms / 0.1));
    if (rec.speechStart < 0) {
      if (rms > thr) {
        if (++rec.above >= 2) {
          rec.speechStart = Math.max(rec.offset, rec.total - f.length * 2);
          rec.lastVoice = rec.total; rec.lastVoiceWall = t;
          rec.opts.onSpeech && rec.opts.onSpeech(true);
        }
      } else {
        rec.above = 0; rec.noise = rec.noise * 0.92 + rms * 0.08;
        const keep = rec.sr * 0.35; // keep ~350 ms of pre-roll
        while (rec.frames.length > 1 && (rec.total - rec.offset - rec.frames[0].length) >= keep) {
          rec.offset += rec.frames[0].length; rec.frames.shift();
        }
      }
      if (rec.speechStart < 0 && t - rec.startedAt > CONFIG.NO_SPEECH_TIMEOUT_MS) finish(rec, "no_speech");
      return;
    }
    if (rms > thr * 0.65) { rec.lastVoice = rec.total; rec.lastVoiceWall = t; }
    const silenceMs = (rec.total - rec.lastVoice) / rec.sr * 1000;
    const speechMs = (rec.lastVoice - rec.speechStart) / rec.sr * 1000;
    if (silenceMs >= rec.opts.silenceMs) {
      if (speechMs < 180) { // a click or a cough — keep listening
        rec.speechStart = -1; rec.above = 0; rec.opts.onSpeech && rec.opts.onSpeech(false);
      } else finish(rec, "endpoint");
    } else if ((rec.total - rec.speechStart) / rec.sr * 1000 > CONFIG.MAX_RECORDING_MS) finish(rec, "max");
  }

  function teardown(rec) {
    try { rec.node && (rec.node.port ? (rec.node.port.onmessage = null) : (rec.node.onaudioprocess = null)); } catch { /* */ }
    try { rec.src.disconnect(); } catch { /* */ }
    try { rec.node && rec.node.disconnect(); } catch { /* */ }
    try { rec.sink.disconnect(); } catch { /* */ }
    try { rec.stream.getTracks().forEach(tr => tr.stop()); } catch { /* */ }
  }

  function finish(rec, reason) {
    if (rec.done) return;
    rec.done = true;
    if (cur === rec) cur = null;
    const tEnd = now();
    teardown(rec);
    if (reason === "cancel") { rec.opts.onEnd({ reason }); return; }
    if (rec.speechStart < 0) { rec.opts.onEnd({ reason: "no_speech" }); return; }
    const startS = Math.max(rec.offset, rec.speechStart - Math.floor(rec.sr * 0.25));
    const endS = Math.min(rec.total, rec.lastVoice + Math.floor(rec.sr * 0.2));
    const pcm = new Float32Array(Math.max(0, endS - startS));
    let pos = rec.offset, w = 0;
    for (const fr of rec.frames) {
      const a = Math.max(startS, pos), b = Math.min(endS, pos + fr.length);
      if (b > a) { pcm.set(fr.subarray(a - pos, b - pos), w); w += b - a; }
      pos += fr.length; if (pos >= endS) break;
    }
    const outRate = rec.sr > 16000 ? 16000 : rec.sr;
    const wav = encodeWav(downsample(pcm, rec.sr, outRate), outRate);
    rec.opts.onEnd({
      reason, wav, tEnd,
      captureMs: speechDur(rec), endpointMs: reason === "endpoint" ? tEnd - rec.lastVoiceWall : 0
    });
  }
  const speechDur = rec => (rec.lastVoice - rec.speechStart) / rec.sr * 1000;

  function downsample(buf, inRate, outRate) {
    if (inRate === outRate) return buf;
    const ratio = inRate / outRate, n = Math.floor(buf.length / ratio), out = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const a = Math.floor(i * ratio), b = Math.min(buf.length, Math.floor((i + 1) * ratio));
      let s = 0; for (let j = a; j < b; j++) s += buf[j];
      out[i] = b > a ? s / (b - a) : 0;
    }
    return out;
  }
  function encodeWav(samples, rate) {
    const buf = new ArrayBuffer(44 + samples.length * 2), v = new DataView(buf);
    const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    str(0, "RIFF"); v.setUint32(4, 36 + samples.length * 2, true); str(8, "WAVE"); str(12, "fmt ");
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, rate, true);
    v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); str(36, "data");
    v.setUint32(40, samples.length * 2, true);
    for (let i = 0, o = 44; i < samples.length; i++, o += 2) {
      const s = Math.max(-1, Math.min(1, samples[i])); v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    }
    return buf;
  }
  function stop() { if (cur) finish(cur, "manual"); }
  function cancel() { if (cur) finish(cur, "cancel"); }
  return { start, stop, cancel, unlock, get active() { return !!cur; } };
})();
