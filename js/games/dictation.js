// 2. Тыңда да жаз — dictation: Edge TTS reads a sentence, the player types it, words are compared.
import { esc } from "../utils.js";
import { frame, loadItems, loadingHTML, errorHTML, showResult, say, Pair, ICON, G } from "./core.js";
import { compare } from "./text-diff.js";

const ROUNDS = 6;

export function diffHTML(res) {
  return res.tokens.map(t => {
    if (t.kind === "ok") return `<span class="w ok">${esc(t.w)}</span>`;
    if (t.kind === "near") return `<span class="w near" title="Сіз: ${esc(t.got)}">${esc(t.w)}<small>${esc(t.got)}</small></span>`;
    if (t.kind === "miss") return `<span class="w miss">${esc(t.w)}</span>`;
    return `<span class="w extra">${esc(t.w)}</span>`;
  }).join(" ");
}
export const diffLegend = `<p class="g-legend"><span class="w ok">дұрыс</span> <span class="w near">сәл қате</span> <span class="w miss">жоқ</span> <span class="w extra">артық</span></p>`;

export default {
  id: "dictation", emoji: "🎧", title: "Тыңда да жаз", group: "listen",
  desc: "Сөйлемді тыңдап, естігеніңізді жазыңыз.", needs: ["tts"],
  async run(root, s) {
    const p = Pair.get();
    const ui = frame(root, this, { total: ROUNDS });
    const st = ui.stage;
    st.innerHTML = loadingHTML();
    let items;
    try { items = await loadItems(s, "phrases", ROUNDS, p); }
    catch (e) { if (!s.alive()) return; st.innerHTML = errorHTML(e.code); st.querySelector("#gRetry").onclick = () => this.run(root, s); return; }
    if (!s.alive()) return;

    let i = 0, score = 0, sum = 0;
    const review = [];

    const show = () => {
      if (i >= items.length) return end();
      ui.setStep(i, items.length);
      const it = items[i];
      st.innerHTML = `
        <div class="g-prompt">
          <p class="g-label">Тыңдап, жазыңыз (${esc(i + 1)}/${items.length})</p>
          <div class="g-row">
            <button class="btn primary" id="dPlay">${ICON.play}${esc(G.listen)}</button>
            <button class="btn" id="dSlow">${ICON.slow}${esc(G.slow)}</button>
          </div>
        </div>
        <textarea class="g-input" id="dIn" rows="2" lang="${p.learn}" autocomplete="off" autocapitalize="sentences" spellcheck="false"
          placeholder="Естігеніңізді осында жазыңыз…" aria-label="Естіген сөйлем"></textarea>
        <div class="g-row end"><button class="btn primary" id="dCheck" disabled>Тексеру</button></div>
        <div id="dRes" aria-live="polite"></div>`;
      const inp = st.querySelector("#dIn"), chk = st.querySelector("#dCheck");
      st.querySelector("#dPlay").onclick = () => say(it.text, p.learn);
      st.querySelector("#dSlow").onclick = () => say(it.text, p.learn, { rate: -35 });
      inp.oninput = () => { chk.disabled = !inp.value.trim(); };
      inp.onkeydown = e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if (!chk.disabled) chk.click(); } };
      chk.onclick = () => check(it, inp.value);
      say(it.text, p.learn);
    };

    const check = (it, typed) => {
      const res = compare(it.text, typed);
      const pts = Math.round(res.score / 10);
      score += pts; sum += res.score;
      ui.setScore(score);
      review.push({ q: it.text, a: typed || "—", ok: res.score >= 90, note: `${res.score}%` });
      st.querySelector("#dIn").disabled = true;
      st.querySelector("#dCheck").remove();
      st.querySelector("#dRes").innerHTML = `
        <div class="g-check ${res.score >= 90 ? "good" : res.score >= 50 ? "mid" : "bad"}">
          <div class="g-pct"><b>${res.score}%</b><small>сөз дәлдігі · +${pts}</small></div>
          <p class="g-diff" lang="${p.learn}">${diffHTML(res)}</p>
          ${diffLegend}
          <p class="g-orig"><small>Дұрыс нұсқа:</small> <span lang="${p.learn}">${esc(it.text)}</span></p>
          ${it.translation ? `<p class="g-orig"><small>Аудармасы:</small> ${esc(it.translation)}</p>` : ""}
        </div>
        <div class="g-row end"><button class="btn primary" id="dNext">${esc(i + 1 >= items.length ? G.finish : G.next)}</button></div>`;
      st.querySelector("#dNext").onclick = () => { i++; show(); };
      st.querySelector("#dNext").focus({ preventScroll: true });
    };

    const end = () => {
      const avg = items.length ? Math.round(sum / items.length) : 0;
      showResult(root, this, { score, correct: review.filter(r => r.ok).length, total: items.length, xp: Math.round(avg / 4), max: items.length * 10, review,
        extraHTML: `<p class="muted">Орташа сөз дәлдігі: <b>${avg}%</b></p>` }, { onAgain: () => this.run(root, s) });
    };
    show();
  }
};
