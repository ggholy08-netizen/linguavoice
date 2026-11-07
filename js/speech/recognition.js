// One microphone session at a time, shared by the translator and conversation views.
// Tap = start; tap again = "I'm done"; the end of speech is also detected automatically.
// Feedback-loop protection: our own voice playback is stopped before recording starts.
import { Recorder } from "./microphone.js";
import { Player } from "../voice/playback.js";
import { Engine } from "../translation/translator.js";
import { Voices } from "../voice/tts.js";
import { BACKEND, Net } from "../net.js";
import { prefs } from "../storage/settings.js";
import { status, fail } from "../ui/status.js";
import { bus } from "../state.js";
import { uid } from "../utils.js";

export function missingFeatures() {
  if (!window.WebSocket || !(window.AudioContext || window.webkitAudioContext)) return "unsupported";
  if (!window.isSecureContext) return "insecure";
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return "unsupported";
  return null;
}

export const Recognition = {
  rec: null, // { id, view, mode, speaker, source, target }

  get active() { return Recorder.active || !!this.rec; },
  same(ctx) { return this.rec && this.rec.view === ctx.view && this.rec.speaker === ctx.speaker; },

  /** ctx = { view, mode, speaker?, source, target } */
  async toggle(ctx) {
    // Inside the user gesture: unlock audio output for the later playback (iOS/Safari autoplay rules).
    Player.unlock();
    if (Recorder.active) {
      if (this.same(ctx)) { Recorder.stop(); return; }
      Recorder.cancel();
    } else if (this.rec) { // still waiting for the microphone permission prompt
      const old = this.rec; this.rec = null; bus.emit("rec:state", old, "idle"); status.set("ready"); return;
    }
    const missing = missingFeatures();
    if (missing) { fail(missing); return; }
    if (!BACKEND.ok) { fail(BACKEND.code); return; }
    if (navigator.onLine === false) { fail("no_internet"); return; }
    if (!Voices.hasVoice(ctx.target)) { fail("no_voice_for_target"); return; }
    Player.stop(true);
    Engine.cancel();
    const rc = { ...ctx, id: uid() };
    this.rec = rc;
    bus.emit("rec:state", rc, "listening");
    status.set("listening");
    if (!Net.open) Net.connect(); // warm the connection while the user speaks
    try {
      await Recorder.start({
        silenceMs: prefs.silenceMs,
        onLevel: lv => bus.emit("rec:level", rc, lv),
        onSpeech: on => { bus.emit("rec:speech", rc, on); status.set(on ? "hearing" : "listening"); },
        onEnd: res => this.onEnd(rc, res)
      });
      if (this.rec !== rc) Recorder.cancel(); // cancelled while the permission prompt was open
    } catch (e) {
      if (this.rec === rc) this.rec = null;
      bus.emit("rec:state", rc, "idle");
      fail(e.code || "mic_failed");
    }
  },

  cancel() {
    if (!this.active) return;
    const rc = this.rec;
    Recorder.cancel(); this.rec = null;
    if (rc) bus.emit("rec:state", rc, "idle");
    status.set("ready");
  },

  onEnd(rc, res) {
    if (this.rec !== rc) return;
    this.rec = null;
    bus.emit("rec:level", rc, 0);
    if (res.reason === "cancel") { bus.emit("rec:state", rc, "idle"); return; }
    if (res.reason === "no_speech") { bus.emit("rec:state", rc, "idle"); fail("no_speech"); return; }
    bus.emit("rec:state", rc, "busy");
    Engine.translateAudio(rc, res);
  }
};
