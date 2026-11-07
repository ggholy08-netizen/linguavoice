// 4. Айт та аудар — see a phrase in your language, say its translation out loud; Gemini checks the meaning.
import { esc } from "../utils.js";
import { langName } from "../i18n.js";
import { frame, loadItems, loadingHTML, errorHTML, showResult, Pair, G, micProblem, gameErr } from "./core.js";
import { langStem } from "./core.js";
import { voiceRound, judgeHTML, wireSay } from "./voice-round.js";

const ROUNDS = 5;

export default {
  id: "say", emoji: "🗣️", title: "Айт та аудар", group: "listen",
  desc: "Сөйлемді үйреніп жатқан тіліңізге дауыстап аударыңыз.", needs: ["mic", "server"],
  async run(root, s) {
    const p = Pair.get();
    const ui = frame(root, this, { total: ROUNDS });
    const st = ui.stage;
    const problem = micProblem();
    if (problem) { st.innerHTML = `<div class="g-error"><p>${esc(gameErr(problem))}</p></div>`; return; }
    st.innerHTML = loadingHTML();
    let items;
    try { items = await loadItems(s, "phrases", ROUNDS, p); }
    catch (e) { if (!s.alive()) return; st.innerHTML = errorHTML(e.code); st.querySelector("#gRetry").onclick = () => this.run(root, s); return; }
    if (!s.alive()) return;

    let i = 0, score = 0, correct = 0;
    const review = [];
    const show = async () => {
      if (i >= items.length) return end();
      ui.setStep(i, items.length);
      const it = items[i];
      st.innerHTML = `
        <div class="g-prompt">
          <p class="g-label">${esc(langStem(p.learn))} тіліне дауыстап аударыңыз</p>
          <p class="g-word mid" lang="${p.know}">${esc(it.translation)}</p>
        </div>
        <div id="sHost"></div>`;
      const host = st.querySelector("#sHost");
      const res = await voiceRound(s, host, { task: "translate", lang: p.learn, know: p.know, prompt: it.translation, reference: it.text, level: p.level });
      if (!res || !s.alive()) return;
      const pts = Math.round(res.score / 10);
      score += pts; if (res.verdict === "correct") correct++;
      ui.setScore(score);
      review.push({ q: it.translation, a: res.corrected || it.text, ok: res.verdict === "correct", note: `${res.score}/100 · ${res.transcript}` });
      host.innerHTML = judgeHTML(res, p.learn) + `
        <p class="g-orig"><small>Үлгі аударма:</small> <span lang="${p.learn}">${esc(it.text)}</span></p>
        <div class="g-row end"><button class="btn" id="sAgain">Қайта айту</button><button class="btn primary" id="sNext">${esc(i + 1 >= items.length ? G.finish : G.next)}</button></div>`;
      wireSay(host, p.learn);
      host.querySelector("#sNext").onclick = () => { i++; show(); };
      host.querySelector("#sAgain").onclick = () => { score -= pts; if (res.verdict === "correct") correct--; review.pop(); ui.setScore(score); show(); };
    };
    const end = () => showResult(root, this, { score, correct, total: items.length, xp: score + correct * 2, max: items.length * 10, review },
      { onAgain: () => this.run(root, s) });
    show();
  }
};
