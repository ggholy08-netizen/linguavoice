// 9. Екеуара ойын — two players on one phone take turns translating phrases out loud; Gemini scores each answer.
import { esc } from "../utils.js";
import { langName } from "../i18n.js";
import { store } from "../storage/settings.js";
import { frame, loadItems, loadingHTML, errorHTML, showResult, Pair, G, micProblem, gameErr } from "./core.js";
import { langStem } from "./core.js";
import { voiceRound, judgeHTML, wireSay } from "./voice-round.js";

export default {
  id: "duel", emoji: "⚔️", title: "Екеуара ойын", group: "talk",
  desc: "Екі адам кезекпен аударады — кім көп ұпай жинайды?", needs: ["mic", "server"],
  run(root, s) {
    const p = Pair.get();
    const ui = frame(root, this);
    const st = ui.stage;
    const problem = micProblem();
    if (problem) { st.innerHTML = `<div class="g-error"><p>${esc(gameErr(problem))}</p></div>`; return; }
    const names = store.get("duelNames", ["1-ойыншы", "2-ойыншы"]);
    st.innerHTML = `
      <p class="g-label">Телефонды кезекпен беріп отырыңыз. Әр ойыншы ${esc(langStem(p.know))} тіліндегі сөйлемді ${esc(langStem(p.learn))} тіліне дауыстап аударады.</p>
      <div class="duel-setup">
        <label class="field"><span class="field-head">1-ойыншы</span><input class="g-input one" id="n1" maxlength="20" value="${esc(names[0])}"></label>
        <label class="field"><span class="field-head">2-ойыншы</span><input class="g-input one" id="n2" maxlength="20" value="${esc(names[1])}"></label>
        <div class="field"><span class="field-head">Раунд саны</span>
          <div class="seg" id="nRounds" role="group" aria-label="Раунд саны"><button data-n="3" aria-pressed="true">3</button><button data-n="5" aria-pressed="false">5</button></div></div>
      </div>
      <div class="g-actions"><button class="btn primary" id="dStart">Бастау</button></div>`;
    let rounds = 3;
    st.querySelectorAll("#nRounds button").forEach(b => b.onclick = () => {
      rounds = +b.dataset.n;
      st.querySelectorAll("#nRounds button").forEach(x => x.setAttribute("aria-pressed", String(x === b)));
    });
    st.querySelector("#dStart").onclick = () => {
      const n = [st.querySelector("#n1").value.trim() || "1-ойыншы", st.querySelector("#n2").value.trim() || "2-ойыншы"];
      store.set("duelNames", n);
      this.play(root, s, ui, n, rounds);
    };
  },

  async play(root, s, ui, names, rounds) {
    const p = Pair.get();
    const st = ui.stage;
    const total = rounds * 2;
    st.innerHTML = loadingHTML();
    let items;
    try { items = await loadItems(s, "phrases", total, p); }
    catch (e) { if (!s.alive()) return; st.innerHTML = errorHTML(e.code); st.querySelector("#gRetry").onclick = () => this.play(root, s, ui, names, rounds); return; }
    if (!s.alive()) return;
    // the built-in bank may have fewer phrases than needed: reuse them in another order
    while (items.length < total) items = items.concat(items).slice(0, total);

    const pts = [0, 0];
    let i = 0;
    const board = () => `<div class="duel-board">
      <span class="${i % 2 === 0 ? "on" : ""}"><b>${esc(names[0])}</b> ${pts[0]}</span><i>:</i><span class="${i % 2 === 1 ? "on" : ""}">${pts[1]} <b>${esc(names[1])}</b></span></div>`;
    const show = async () => {
      if (i >= total) return end();
      ui.setStep(i, total);
      const who = i % 2, it = items[i];
      st.innerHTML = `${board()}
        <p class="g-turn">Кезек: <b>${esc(names[who])}</b> · ${Math.floor(i / 2) + 1}-раунд</p>
        <div class="g-prompt"><p class="g-label">${esc(langStem(p.learn))} тіліне аударыңыз</p><p class="g-word mid" lang="${p.know}">${esc(it.translation)}</p></div>
        <div id="duHost"></div>`;
      const host = st.querySelector("#duHost");
      const res = await voiceRound(s, host, { task: "translate", lang: p.learn, know: p.know, prompt: it.translation, reference: it.text, level: p.level },
        { label: `${names[who]}, басып сөйлеңіз` });
      if (!res || !s.alive()) return;
      const got = Math.round(res.score / 10);
      pts[who] += got;
      ui.setScore(`${pts[0]}:${pts[1]}`);
      host.innerHTML = judgeHTML(res, p.learn) + `<p class="g-tip">${esc(names[who])}: +${got}</p>
        <div class="g-row end"><button class="btn primary" id="duNext">${i + 1 >= total ? esc(G.finish) : `Кезек: ${esc(names[1 - who])}`}</button></div>`;
      wireSay(host, p.learn);
      host.querySelector("#duNext").onclick = () => { i++; show(); };
    };
    const end = () => {
      const win = pts[0] === pts[1] ? null : pts[0] > pts[1] ? 0 : 1;
      showResult(root, this, {
        score: Math.max(pts[0], pts[1]), correct: 0, total: 0, xp: Math.round((pts[0] + pts[1]) / 2), max: rounds * 10,
        extraHTML: `<div class="duel-final">${win === null ? "🤝 Тең түсті!" : `🏆 Жеңімпаз: <b>${esc(names[win])}</b>`}
          <p>${esc(names[0])}: <b>${pts[0]}</b> · ${esc(names[1])}: <b>${pts[1]}</b></p></div>`
      }, { onAgain: () => this.play(root, s, ui, names, rounds) });
    };
    show();
  }
};
