// 5. Дауыс челленджі — repeat a tongue twister / hard-sounds phrase. Gemini writes down what it heard and
// the app compares the words with the reference. This is word matching, not a phonetic assessment.
import { esc } from "../utils.js";
import { frame, loadItems, loadingHTML, errorHTML, showResult, say, Pair, ICON, G, micProblem, gameErr,
  recordPhrase, recording, stopRecording, checkVoice, micBtnHTML } from "./core.js";
import { compare, words } from "./text-diff.js";
import { diffHTML, diffLegend } from "./dictation.js";

const ROUNDS = 5;

export default {
  id: "twister", emoji: "🌀", title: "Дауыс челленджі", group: "listen",
  desc: "Жаңылтпашты немесе қиын дыбысты сөйлемді анық әрі жылдам қайталаңыз.", needs: ["mic", "server"],
  async run(root, s) {
    const p = Pair.get();
    const ui = frame(root, this, { total: ROUNDS });
    const st = ui.stage;
    const problem = micProblem();
    if (problem) { st.innerHTML = `<div class="g-error"><p>${esc(gameErr(problem))}</p></div>`; return; }
    st.innerHTML = loadingHTML();
    let items;
    try { items = await loadItems(s, "twister", ROUNDS, p); }
    catch (e) { if (!s.alive()) return; st.innerHTML = errorHTML(e.code); st.querySelector("#gRetry").onclick = () => this.run(root, s); return; }
    if (!s.alive()) return;

    let i = 0, score = 0, best = 0, sum = 0;
    const review = [];
    const show = () => {
      if (i >= items.length) return end();
      ui.setStep(i, items.length);
      const it = items[i];
      st.innerHTML = `
        <div class="g-prompt">
          <p class="g-label">${it.builtin_kk ? "Қиын дыбыстар" : "Жаңылтпаш"}${it.focus ? ` · ${esc(it.focus)}` : ""}</p>
          <p class="g-word mid" lang="${p.learn}">${esc(it.text)}</p>
          ${it.translation ? `<p class="g-sub">${esc(it.translation)}</p>` : ""}
          <div class="g-row center"><button class="chip-btn" id="tSay">${ICON.play} ${esc(G.listen)}</button><button class="chip-btn" id="tSlow">${ICON.slow} ${esc(G.slow)}</button></div>
        </div>
        <div class="g-mic">${micBtnHTML("tMic")}<p class="g-micnote" id="tNote">Басып, сөйлемді қайталаңыз</p></div>
        <div id="tRes" aria-live="polite"></div>`;
      st.querySelector("#tSay").onclick = () => say(it.text, p.learn);
      st.querySelector("#tSlow").onclick = () => say(it.text, p.learn, { rate: -35 });
      const btn = st.querySelector("#tMic"), note = st.querySelector("#tNote");
      let busy = false;
      btn.onclick = async () => {
        if (recording()) { stopRecording(); return; }
        if (busy) return; busy = true;
        note.textContent = "Тыңдап тұрмын…";
        const rec = await recordPhrase(btn, s, { maxMs: 20000 });
        if (!s.alive()) return;
        if (!rec) { busy = false; note.textContent = "Басып, сөйлемді қайталаңыз"; return; }
        const resBox = st.querySelector("#tRes");
        st.querySelector(".g-mic").hidden = true;
        resBox.innerHTML = loadingHTML(G.checking);
        let tr;
        try { tr = await checkVoice(s, rec.wav, { task: "transcribe", lang: p.learn }); }
        catch (e) {
          if (!s.alive()) return;
          busy = false; st.querySelector(".g-mic").hidden = false; note.textContent = "Басып, сөйлемді қайталаңыз";
          resBox.innerHTML = `<div class="g-error"><p>${esc(gameErr(e.code))}</p></div>`; return;
        }
        if (!s.alive()) return;
        const cmp = compare(it.text, tr.transcript);
        const secs = Math.max(0.3, rec.captureMs / 1000);
        const wps = words(it.text).length / secs;
        const bonus = cmp.score >= 90 && wps >= 2 ? 3 : 0;
        const pts = Math.round(cmp.score / 10) + bonus;
        score += pts; sum += cmp.score; best = Math.max(best, cmp.score);
        ui.setScore(score);
        review.push({ q: it.text, a: tr.transcript, ok: cmp.score >= 90, note: `${cmp.score}% · ${secs.toFixed(1)} с` });
        resBox.innerHTML = `
          <div class="g-check ${cmp.score >= 90 ? "good" : cmp.score >= 50 ? "mid" : "bad"}">
            <div class="g-pct"><b>${cmp.score}%</b><small>сөз сәйкестігі · ${secs.toFixed(1)} с · ${wps.toFixed(1)} сөз/с${bonus ? " · ⚡ жылдамдық бонусы" : ""}</small></div>
            <p class="g-diff" lang="${p.learn}">${diffHTML(cmp)}</p>
            ${diffLegend}
            <p class="g-orig"><small>Gemini естігені:</small> <span lang="${p.learn}">${esc(tr.transcript)}</span></p>
            <p class="g-note">${esc(G.wordMatchNote)}</p>
          </div>
          <div class="g-row end"><button class="btn" id="tAgain">Қайталау</button><button class="btn primary" id="tNext">${esc(i + 1 >= items.length ? G.finish : G.next)}</button></div>`;
        resBox.querySelector("#tNext").onclick = () => { i++; show(); };
        resBox.querySelector("#tAgain").onclick = () => { score -= pts; sum -= cmp.score; review.pop(); ui.setScore(score); show(); };
      };
    };
    const end = () => {
      const avg = items.length ? Math.round(sum / items.length) : 0;
      showResult(root, this, { score, correct: review.filter(r => r.ok).length, total: items.length, xp: Math.round(avg / 4) + 2, max: items.length * 13, review,
        extraHTML: `<p class="muted">Орташа сөз сәйкестігі: <b>${avg}%</b> · ең жақсысы: <b>${best}%</b></p><p class="g-note">${esc(G.wordMatchNote)}</p>` },
        { onAgain: () => this.run(root, s) });
    };
    show();
  }
};
