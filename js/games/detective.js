// 8. Детектив сөздер — guess the word from up to three clues in the language you are learning.
import { esc } from "../utils.js";
import { langName } from "../i18n.js";
import { frame, loadItems, loadingHTML, errorHTML, showResult, say, Pair, ICON, G } from "./core.js";
import { langStem } from "./core.js";
import { matchAnswer } from "./text-diff.js";

const ROUNDS = 5;

export default {
  id: "detective", emoji: "🕵️", title: "Детектив сөздер", group: "vocab",
  desc: "Кеңестер арқылы жасырын сөзді табыңыз.", needs: [],
  async run(root, s) {
    const p = Pair.get();
    const ui = frame(root, this, { total: ROUNDS });
    const st = ui.stage;
    st.innerHTML = loadingHTML();
    let items;
    try { items = await loadItems(s, "riddle", ROUNDS, p); }
    catch (e) { if (!s.alive()) return; st.innerHTML = errorHTML(e.code); st.querySelector("#gRetry").onclick = () => this.run(root, s); return; }
    if (!s.alive()) return;

    let i = 0, score = 0, correct = 0;
    const review = [];
    const show = () => {
      if (i >= items.length) return end();
      ui.setStep(i, items.length);
      const it = items[i];
      const accept = it.accept && it.accept.length ? it.accept : [it.answer];
      let shown = 1, usedTr = false, tries = 0, done = false;
      st.innerHTML = `
        <p class="g-label">Бұл қандай сөз? Жауапты ${esc(langStem(p.learn))} тілінде жазыңыз.</p>
        <ol class="clues" id="dClues"></ol>
        <div class="g-row"><button class="chip-btn" id="dMore">🔎 Тағы кеңес</button><button class="chip-btn" id="dTr">Аудармасы (−5)</button><button class="chip-btn" id="dGive">Берілемін</button></div>
        <div class="g-answer"><input class="g-input one" id="dIn" lang="${p.learn}" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Жауабыңыз…" aria-label="Жауабыңыз">
          <button class="btn primary" id="dGo" disabled>Тексеру</button></div>
        <div id="dRes" aria-live="polite"></div>`;
      const clues = st.querySelector("#dClues"), inp = st.querySelector("#dIn"), go = st.querySelector("#dGo");
      const renderClues = () => {
        clues.innerHTML = it.clues.slice(0, shown).map((c, k) => `<li><span lang="${p.learn}">${esc(c)}</span>
          ${usedTr && it.clues_translation && it.clues_translation[k] ? `<small>${esc(it.clues_translation[k])}</small>` : ""}</li>`).join("");
        st.querySelector("#dMore").disabled = shown >= it.clues.length || done;
        st.querySelector("#dTr").disabled = usedTr || done || !(it.clues_translation || []).some(Boolean);
      };
      renderClues();
      const points = () => Math.max(5, [30, 20, 10][shown - 1] - (usedTr ? 5 : 0) - tries * 2);
      st.querySelector("#dMore").onclick = () => { if (shown < it.clues.length) { shown++; renderClues(); } };
      st.querySelector("#dTr").onclick = () => { usedTr = true; renderClues(); };
      inp.oninput = () => { go.disabled = !inp.value.trim() || done; };
      inp.onkeydown = e => { if (e.key === "Enter" && !go.disabled) go.click(); };
      const reveal = (ok, msg) => {
        done = true; inp.disabled = true; go.disabled = true; renderClues();
        st.querySelector("#dGive").disabled = true;
        st.querySelector("#dRes").innerHTML = `
          <div class="g-check ${ok ? "good" : "bad"}"><p>${msg}</p>
            <p class="g-word small" lang="${p.learn}">${esc(it.answer)} <button class="chip-btn" id="dSay" aria-label="Тыңдау">${ICON.play}</button></p>
            ${it.answer_translation ? `<p class="g-sub">${esc(it.answer_translation)}</p>` : ""}</div>
          <div class="g-row end"><button class="btn primary" id="dNext">${esc(i + 1 >= items.length ? G.finish : G.next)}</button></div>`;
        st.querySelector("#dSay").onclick = () => say(it.answer, p.learn);
        st.querySelector("#dNext").onclick = () => { i++; show(); };
        st.querySelector("#dNext").focus({ preventScroll: true });
      };
      go.onclick = () => {
        const m = matchAnswer(inp.value, accept);
        if (m) {
          const pts = points();
          score += pts; correct++; ui.setScore(score);
          review.push({ q: it.clues[0], a: it.answer, ok: true });
          reveal(true, m === "exact" ? `<b class="good">Таптыңыз! +${pts}</b>` : `<b class="good">Таптыңыз! +${pts}</b> Емлесіне назар аударыңыз:`);
        } else {
          tries++;
          inp.select();
          const box = st.querySelector("#dRes");
          box.innerHTML = `<p class="g-feedback"><b class="bad">Жоқ, бұл емес.</b> ${shown < it.clues.length ? "Тағы бір кеңес алыңыз." : "Тағы ойланып көріңіз."}</p>`;
        }
      };
      st.querySelector("#dGive").onclick = () => { review.push({ q: it.clues[0], a: it.answer, ok: false }); reveal(false, "Жауабы:"); };
    };
    const end = () => showResult(root, this, { score, correct, total: items.length, xp: correct * 6 + Math.round(score / 10), max: items.length * 30, review },
      { onAgain: () => this.run(root, s) });
    show();
  }
};
