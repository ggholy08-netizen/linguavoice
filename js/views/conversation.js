// Two-person conversation: each speaker has a language and a big button; the chat shows both texts.
import { $, esc, uid, SVG } from "../utils.js";
import { T, langName } from "../i18n.js";
import { bus } from "../state.js";
import { prefs, savePref } from "../storage/settings.js";
import { Engine } from "../translation/translator.js";
import { Recognition } from "../speech/recognition.js";
import { Voices } from "../voice/tts.js";
import { History } from "../storage/history.js";
import { pickLanguage, copyText, pop } from "../ui/components.js";
import { toast } from "../ui/notifications.js";

const VIEW = "conversation";
const mine = job => job && job.ctx && job.ctx.view === VIEW;
const bubbles = new Map(); // job id -> { el, record, audio, fav }

export const Conversation = {
  init() {
    $("convABtn").onclick = () => pickLanguage({ title: T.pickA, current: prefs.convA, needsVoice: true, onPick: c => this.setLang("a", c) });
    $("convBBtn").onclick = () => pickLanguage({ title: T.pickB, current: prefs.convB, needsVoice: true, onPick: c => this.setLang("b", c) });
    $("convSwap").onclick = () => { const a = prefs.convA; savePref("convA", prefs.convB); savePref("convB", a); $("convSwap").classList.toggle("spin"); this.render(); };
    $("convClear").onclick = () => { Engine.cancel(); bubbles.clear(); $("chat").querySelectorAll(".bubble").forEach(b => b.remove()); $("chatEmpty").hidden = false; };
    bus.on("job:new", job => { if (mine(job)) this.addBubble(job); });
    bus.on("job:partial", (job, m) => this.onPartial(job, m));
    bus.on("job:result", (job, m) => this.onResult(job, m));
    bus.on("job:done", job => { const b = bubbles.get(job.id); if (b) b.audio = job.audio || []; });
    bus.on("job:error", (job, code) => this.onError(job, code));
    bus.on("job:cancel", job => { const b = bubbles.get(job.id); if (b && !job.gotResult) { b.el.remove(); bubbles.delete(job.id); this.emptyCheck(); } });
    bus.on("voices", () => this.render());
    this.render();
  },
  setLang(side, code) {
    const other = side === "a" ? "convB" : "convA", key = side === "a" ? "convA" : "convB";
    if (prefs[other] === code) savePref(other, prefs[key]);
    savePref(key, code); this.render();
  },
  render() {
    $("convAName").textContent = langName(prefs.convA); $("convBName").textContent = langName(prefs.convB);
    $("spkALang").textContent = `${prefs.convA.toUpperCase()} → ${prefs.convB.toUpperCase()}`;
    $("spkBLang").textContent = `${prefs.convB.toUpperCase()} → ${prefs.convA.toUpperCase()}`;
  },
  mic(speaker) {
    const a = speaker === "a";
    Recognition.toggle({ view: VIEW, mode: "conversation", speaker, source: a ? prefs.convA : prefs.convB, target: a ? prefs.convB : prefs.convA });
  },
  emptyCheck() { $("chatEmpty").hidden = !!$("chat").querySelector(".bubble"); },

  addBubble(job) {
    const ctx = job.ctx;
    $("chatEmpty").hidden = true;
    const el = document.createElement("div");
    el.className = "bubble " + ctx.speaker;
    el.innerHTML = `<div class="b-meta">${esc(T.speaker(ctx.speaker === "a" ? 1 : 2))} · ${esc(langName(ctx.source))} → ${esc(langName(ctx.target))}</div>
      <p class="b-src"></p><p class="b-tr"></p>
      <div class="b-actions">
        <button data-act="fav" aria-label="Таңдаулыларға қосу" aria-pressed="false" title="Таңдаулы">${SVG.star}</button>
        <button data-act="replay" aria-label="Қайта тыңдау" title="Қайта тыңдау">${SVG.replay}</button>
        <button data-act="copy" aria-label="Көшіру" title="Көшіру">${SVG.copy}</button>
      </div>`;
    const entry = { el, record: null, audio: null, fav: false, lang: ctx.target, text: "", id: job.id };
    bubbles.set(job.id, entry);
    el.querySelector('[data-act="copy"]').onclick = () => copyText(el.querySelector(".b-tr").textContent);
    el.querySelector('[data-act="replay"]').onclick = () => this.replay(entry);
    el.querySelector('[data-act="fav"]').onclick = () => this.fav(entry);
    $("chat").appendChild(el);
    el.scrollIntoView({ behavior: "smooth", block: "end" });
  },
  onPartial(job, m) {
    const b = bubbles.get(job.id); if (!b) return;
    b.el.querySelector(".b-src").textContent = m.recognized_text || "";
    b.el.querySelector(".b-tr").textContent = m.translated_text || "";
  },
  onResult(job, m) {
    const b = bubbles.get(job.id); if (!b) return;
    b.el.querySelector(".b-src").textContent = m.recognized_text;
    b.el.querySelector(".b-tr").textContent = m.translated_text;
    b.text = m.translated_text; b.record = job.record; b.el.dataset.done = "1";
    b.el.scrollIntoView({ behavior: "smooth", block: "end" });
  },
  onError(job, code) {
    const b = bubbles.get(job.id); if (!b || job.gotResult) return;
    b.el.classList.add("err");
    b.el.querySelector(".b-tr").textContent = T.err[code] || T.err.translate_failed;
  },
  replay(b) {
    if (!b.text) return;
    if (Recognition.active) Recognition.cancel();
    if (b.audio && b.audio.length) { Engine.playCached(b.audio, VIEW); return; }
    Engine.speak({ text: b.text, lang: b.lang, voice: Voices.chosen(b.lang), onAudioDone: segs => { b.audio = segs; }, tag: VIEW + "-" + uid() });
  },
  async fav(b) {
    if (!b.record) return;
    b.fav = !b.fav;
    await History.setFav(b.id, b.fav, b.record);
    const btn = b.el.querySelector('[data-act="fav"]');
    btn.classList.toggle("on", b.fav); btn.setAttribute("aria-pressed", String(b.fav));
    if (b.fav) pop(btn);
    toast(b.fav ? T.favAdded : T.favRemoved, { type: "success", ms: 1800 });
    bus.emit("history:changed");
  }
};
