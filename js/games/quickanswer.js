// 6. Тез сөйле — a question is read aloud; answer it out loud before the timer ends. Gemini checks the answer.
import { esc } from "../utils.js";
import { frame, loadItems, loadingHTML, errorHTML, showResult, say, Pair, ICON, G, micProblem, gameErr, stopRecording, recording } from "./core.js";
import { voiceRound, judgeHTML, wireSay } from "./voice-round.js";

const ROUNDS = 5;
const TIME = { easy: 20, medium: 15, hard: 10 };

export default {
  id: "quick", emoji: "⏱️", title: "Тез сөйле", group: "listen",
  desc: "Сұраққа уақыт біткенше дауыстап жауап беріңіз.", needs: ["mic", "server", "tts"],
  async run(root, s) {
    const p = Pair.get();
    const limit = TIME[p.level] || 15;
    const ui = frame(root, this, { total: ROUNDS });
    const st = ui.stage;
    const problem = micProblem();
    if (problem) { st.innerHTML = `<div class="g-error"><p>${esc(gameErr(problem))}</p></div>`; return; }
    st.innerHTML = loadingHTML();
    let items;
    try { items = await loadItems(s, "question", ROUNDS, p); }
    catch (e) { if (!s.alive()) return; st.innerHTML = errorHTML(e.code); st.querySelector("#gRetry").onclick = () => this.run(root, s); return; }
    if (!s.alive()) return;

    let i = 0, score = 0, correct = 0;
    const review = [];
    const show = async () => {
      if (i >= items.length) return end();
      ui.setStep(i, items.length);
      const it = items[i];
      st.innerHTML = `
        <div class="race-timer" aria-hidden="true"><i id="qTime" style="width:100%"></i></div>
        <div class="g-prompt">
          <p class="g-label">Сұраққа жауап беріңіз · <span id="qLeft">${limit}</span> с</p>
          <p class="g-word mid" lang="${p.learn}">${esc(it.question)}</p>
          <div class="g-row center"><button class="chip-btn" id="qSay">${ICON.play} ${esc(G.listen)}</button>
            ${it.translation ? `<button class="chip-btn" id="qTr">Аудармасы</button>` : ""}</div>
          <p class="g-sub" id="qTrText" hidden>${esc(it.translation || "")}</p>
        </div>
        <div id="qHost"></div>`;
      const qTr = st.querySelector("#qTr");
      if (qTr) qTr.onclick = () => { st.querySelector("#qTrText").hidden = false; qTr.remove(); };
      st.querySelector("#qSay").onclick = () => say(it.question, p.learn);
      const host = st.querySelector("#qHost");
      let t0 = 0, timer = 0, timeUp = false, answeredAt = 0;
      const round = { cancelled: false };
      const startTimer = () => {
        if (t0) return;
        t0 = performance.now();
        timer = s.every(() => {
          const left = limit - (performance.now() - t0) / 1000;
          const bar = st.querySelector("#qTime"), lab = st.querySelector("#qLeft");
          if (bar) { bar.style.width = `${Math.max(0, (left / limit) * 100)}%`; bar.classList.toggle("low", left < 4); }
          if (lab) lab.textContent = Math.max(0, Math.ceil(left));
          if (left <= 0) {
            s.clear(timer); timeUp = true;
            if (recording()) stopRecording(); // submit what was said so far
            else if (!answeredAt) { // never started speaking
              round.cancelled = true;
              review.push({ q: it.question, a: "—", ok: false, note: "Уақыт бітті" });
              host.innerHTML = `<div class="g-check bad"><p><b>Уақыт бітті.</b> Келесіде микрофонды ертерек басыңыз.</p></div>
                <div class="g-row end"><button class="btn primary" id="qNext">${esc(i + 1 >= items.length ? G.finish : G.next)}</button></div>`;
              host.querySelector("#qNext").onclick = () => { i++; show(); };
            }
          }
        }, 100);
      };
      // start the clock after the question has been read (or right away if the voice fails)
      say(it.question, p.learn).finally(() => { if (s.alive()) startTimer(); });
      const res = await voiceRound(s, host, { task: "answer", lang: p.learn, know: p.know, prompt: it.question, level: p.level },
        { limitMs: limit * 1000 + 2000, onRecordStart: () => { answeredAt = performance.now(); startTimer(); } });
      s.clear(timer);
      if (!res || !s.alive() || round.cancelled) return;
      const left = Math.max(0, limit - ((answeredAt || performance.now()) - (t0 || performance.now())) / 1000);
      const bonus = res.verdict === "correct" && !timeUp ? Math.round(left / 2) : 0;
      const pts = Math.round(res.score / 10) + bonus;
      score += pts; if (res.verdict === "correct") correct++;
      ui.setScore(score);
      review.push({ q: it.question, a: res.transcript, ok: res.verdict === "correct", note: res.corrected });
      host.innerHTML = judgeHTML(res, p.learn) + (bonus ? `<p class="g-tip">⚡ Жылдамдық бонусы: +${bonus}</p>` : "") +
        `<div class="g-row end"><button class="btn primary" id="qNext">${esc(i + 1 >= items.length ? G.finish : G.next)}</button></div>`;
      wireSay(host, p.learn);
      host.querySelector("#qNext").onclick = () => { i++; show(); };
    };
    const end = () => showResult(root, this, { score, correct, total: items.length, xp: score + correct * 2, max: items.length * 18, review },
      { onAgain: () => this.run(root, s) });
    show();
  }
};
