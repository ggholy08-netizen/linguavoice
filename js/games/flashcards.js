// 3. Карточкалар — spaced repetition (Leitner boxes) over the user's favourite translations.
// Works without Gemini; only listening uses Edge TTS. Card progress is stored on this device (lv.cards).
import { esc } from "../utils.js";
import { langName } from "../i18n.js";
import { store } from "../storage/settings.js";
import { History } from "../storage/history.js";
import { frame, loadingHTML, showResult, say, ICON } from "./core.js";
import { shuffle } from "./content.js";

const DAY = 86400000;
const fmtDate = t => { const d = new Date(t); return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`; };
const INTERVAL = [0, 0, 1, 3, 7, 16]; // days for box 1..5
const MAX = 15;

const Cards = {
  all() { return store.get("cards", null) || {}; },
  save(c) { store.set("cards", c); },
  due(rec, c) { const st = c[rec.id]; return !st || st.due <= Date.now(); }
};

export default {
  id: "cards", emoji: "🗂️", title: "Карточкалар", group: "vocab",
  desc: "Таңдаулы аудармаларыңызды қайталаңыз.", needs: [],
  async run(root, s, opts = {}) {
    const ui = frame(root, this);
    const st = ui.stage;
    st.innerHTML = loadingHTML("Карточкалар жүктелуде…");
    let favs = [], recent = [];
    try {
      const all = await History.list();
      favs = all.filter(r => r.fav && r.source_text && r.translated_text);
      recent = all.filter(r => r.source_text && r.translated_text).slice(0, 30);
    } catch { /* storage unavailable */ }
    if (!s.alive()) return;
    const pool = opts.recent ? recent : favs;
    const c = Cards.all();

    if (!pool.length) {
      st.innerHTML = `<div class="g-empty"><p class="g-word small">☆</p>
        <p>Таңдаулы аудармалар әзірге жоқ. Аудармашыда аударманың жанындағы ☆ белгісін басыңыз — сол аудармалар осында карточкаға айналады.</p>
        <div class="g-actions">${recent.length ? `<button class="btn primary" id="cRecent">Соңғы ${recent.length} аударманы қолдану</button>` : ""}
        <a class="btn" href="#/translate">Аудармашыға өту</a></div></div>`;
      const b = st.querySelector("#cRecent"); if (b) b.onclick = () => this.run(root, s, { recent: true });
      return;
    }
    let deck = pool.filter(r => opts.all || Cards.due(r, c));
    if (!deck.length) {
      const next = Math.min(...pool.map(r => (c[r.id] ? c[r.id].due : Date.now())));
      st.innerHTML = `<div class="g-empty"><p class="g-word small">✅</p>
        <p>Бүгінге қайталайтын карточка жоқ. Келесі қайталау: <b>${esc(fmtDate(next))}</b>.</p>
        <div class="g-actions"><button class="btn primary" id="cAll">Бәрібір жаттығу</button><a class="btn" href="#/games">Ойындар</a></div></div>`;
      st.querySelector("#cAll").onclick = () => this.run(root, s, { ...opts, all: true });
      return;
    }
    deck = shuffle(deck).sort((a, b) => ((c[a.id] || {}).box || 1) - ((c[b.id] || {}).box || 1)).slice(0, MAX);

    let i = 0, known = 0, reverse = false;
    const review = [];
    const show = () => {
      if (i >= deck.length) return end();
      ui.setStep(i, deck.length);
      const r = deck[i];
      const front = reverse ? { t: r.translated_text, l: r.tgt } : { t: r.source_text, l: r.src };
      const back = reverse ? { t: r.source_text, l: r.src } : { t: r.translated_text, l: r.tgt };
      const box = (c[r.id] || {}).box || 1;
      st.innerHTML = `
        <div class="g-row between"><span class="chip">${esc(langName(front.l))} → ${esc(langName(back.l))}</span>
          <span class="chip violet">Қорап ${box}/5</span>
          <button class="chip-btn" id="cRev">⇄ Керісінше</button></div>
        <button class="flash" id="cCard" aria-live="polite" aria-label="Карточканы аудару">
          <span class="flash-in">
            <span class="flash-face"><span class="f-front" lang="${esc(front.l)}">${esc(front.t)}</span><span class="f-hint">Аудармасын көру үшін басыңыз</span></span>
            <span class="flash-face back" aria-hidden="true"><span class="f-front small" lang="${esc(front.l)}">${esc(front.t)}</span><span class="f-back" lang="${esc(back.l)}">${esc(back.t)}</span></span>
          </span>
        </button>
        <div id="cBack"></div>`;
      st.querySelector("#cRev").onclick = () => { reverse = !reverse; show(); };
      const flip = () => {
        const card = st.querySelector("#cCard");
        if (card.classList.contains("open")) return;
        card.classList.add("open");
        card.querySelector(".flash-face.back").removeAttribute("aria-hidden");
        card.querySelector(".flash-face:not(.back)").setAttribute("aria-hidden", "true");
        st.querySelector("#cBack").innerHTML = `
          <div class="g-row center"><button class="chip-btn" id="cSay">${ICON.play} Тыңдау</button></div>
          <div class="g-row two"><button class="btn danger" id="cNo">Білмедім</button><button class="btn primary" id="cYes">Білдім</button></div>`;
        st.querySelector("#cSay").onclick = () => say(back.t, back.l);
        st.querySelector("#cNo").onclick = () => grade(r, false);
        st.querySelector("#cYes").onclick = () => grade(r, true);
      };
      st.querySelector("#cCard").onclick = flip;
    };
    const grade = (r, ok) => {
      const cur = c[r.id] || { box: 1 };
      const box = ok ? Math.min(5, cur.box + 1) : 1;
      c[r.id] = { box, due: Date.now() + INTERVAL[box] * DAY - 60000 };
      Cards.save(c);
      if (ok) known++;
      ui.setScore(known * 5);
      review.push({ q: r.source_text, a: r.translated_text, ok });
      i++; show();
    };
    const end = () => showResult(root, this, { score: known * 5, correct: known, total: deck.length, xp: known * 2 + deck.length, max: deck.length * 5, review,
      extraHTML: `<p class="muted">«Білдім» деген карточкалар келесі қорапқа өтеді және кейінірек қайталанады.</p>` },
      { onAgain: () => this.run(root, s, { ...opts, all: true }) });
    show();
  }
};
