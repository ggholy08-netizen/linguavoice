// Shared "speak → Gemini checks" round used by Айт та аудар, Тез сөйле and Екеуара ойын.
import { esc } from "../utils.js";
import { recordPhrase, stopRecording, recording, checkVoice, loadingHTML, gameErr, verdictLabel, say, micBtnHTML, ICON, G } from "./core.js";

export function judgeHTML(res, lang) {
  return `
    <div class="g-check ${res.verdict === "correct" ? "good" : res.verdict === "partial" ? "mid" : "bad"}">
      <div class="g-pct"><b>${res.score}</b><small>/100 · ${esc(verdictLabel(res.verdict))}</small></div>
      <p class="g-orig"><small>Сіз айттыңыз:</small> <span lang="${esc(lang)}">${esc(res.transcript)}</span></p>
      ${res.corrected ? `<p class="g-orig"><small>Дұрыс нұсқа:</small> <span lang="${esc(lang)}">${esc(res.corrected)}</span>
        <button class="chip-btn" data-say="${esc(res.corrected)}" aria-label="Дұрыс нұсқаны тыңдау">${ICON.play}</button></p>` : ""}
      ${res.feedback ? `<p class="g-tip">💬 ${esc(res.feedback)}</p>` : ""}
      <p class="g-note">Бағаны Gemini береді: мағына мен грамматика тексеріледі, акцент бағаланбайды.</p>
    </div>`;
}

/**
 * Renders a mic button into `host`, records one phrase, sends it to /api/game/voice with `meta`
 * and resolves with the result (or null if the user cancelled / nothing was said / an error occurred).
 * onStart() is called when recording begins (to stop timers etc.). limitMs caps the recording.
 */
export function voiceRound(s, host, meta, { label = G.speakNow, limitMs = 20000, onRecordStart } = {}) {
  return new Promise(resolve => {
    host.innerHTML = `<div class="g-mic">${micBtnHTML("vrMic", label)}<p class="g-micnote" id="vrNote">${esc(label)}</p></div>`;
    const btn = host.querySelector("#vrMic"), note = host.querySelector("#vrNote");
    let busy = false;
    btn.onclick = async () => {
      if (recording()) { stopRecording(); return; }
      if (busy) return;
      busy = true;
      note.textContent = "Тыңдап тұрмын… Аяқтаған соң кідіріңіз немесе қайта басыңыз.";
      onRecordStart && onRecordStart();
      const rec = await recordPhrase(btn, s, { maxMs: limitMs });
      if (!s.alive()) return resolve(null);
      if (!rec) { busy = false; note.textContent = label; return; }
      host.innerHTML = loadingHTML(G.checking);
      try {
        const res = await checkVoice(s, rec.wav, meta);
        if (!s.alive()) return resolve(null);
        res.captureMs = rec.captureMs;
        resolve(res);
      } catch (e) {
        if (!s.alive() || e.code === "cancelled") return resolve(null);
        host.innerHTML = `<div class="g-error" role="alert"><p>${esc(gameErr(e.code))}</p></div>`;
        const again = document.createElement("button");
        again.className = "btn primary"; again.textContent = G.retry;
        again.onclick = () => voiceRound(s, host, meta, { label, limitMs, onRecordStart }).then(resolve);
        host.querySelector(".g-error").appendChild(again);
      }
    };
  });
}

/** Wire the ▶ buttons inside a judged result. */
export function wireSay(el, lang) {
  el.querySelectorAll("[data-say]").forEach(b => b.onclick = () => say(b.dataset.say, lang));
}
