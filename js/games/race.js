// 1. Сөз жарысы — word race: pick the right translation before the timer runs out.
import { esc } from "../utils.js";
import { frame, loadItems, loadingHTML, errorHTML, showResult, say, Pair, ICON, countdown } from "./core.js";
import { shuffle } from "./content.js";

const ROUNDS = 10;
const TIME = { easy: 12, medium: 10, hard: 7 };

export default {
  id: "race", emoji: "⚡", title: "Сөз жарысы", group: "vocab",
  desc: "Сөздің аудармасын уақыт біткенше табыңыз.", needs: [],
  async run(root, s) {
    const p = Pair.get();
    const ui = frame(root, this, { total: ROUNDS });
    const st = ui.stage;
    st.innerHTML = loadingHTML();
    let items;
    try { items = await loadItems(s, "words", ROUNDS, p); }
    catch (e) { if (!s.alive()) return; st.innerHTML = errorHTML(e.code); st.querySelector("#gRetry").onclick = () => this.run(root, s); return; }
    if (!s.alive()) return;

    let i = 0, score = 0, correct = 0, combo = 0, timer = null, locked = false;
    const review = [];
    const limit = TIME[p.level] || 10;

    const show = () => {
      if (i >= items.length) return end();
      ui.setStep(i, items.length);
      const it = items[i];
      const opts = shuffle([it.translation, ...it.distractors.slice(0, 3)]);
      locked = false;
      st.innerHTML = `
        <div class="race-timer" aria-hidden="true"><i id="rTime"></i></div>
        <div class="g-prompt">
          <p class="g-label">Аудармасын табыңыз</p>
          <p class="g-word" lang="${p.learn}">${esc(it.word)}</p>
          <button class="chip-btn" id="rSay" aria-label="Сөзді тыңдау">${ICON.play} Тыңдау</button>
        </div>
        <div class="race-opts">${opts.map((o, k) => `<button class="opt" data-v="${esc(o)}"><kbd>${k + 1}</kbd><span>${esc(o)}</span></button>`).join("")}</div>
        <p class="g-feedback" id="rFb" aria-live="polite">${combo >= 2 ? `🔥 Комбо ×${combo}` : ""}</p>`;
      st.querySelector("#rSay").onclick = () => say(it.word, p.learn);
      st.querySelectorAll(".opt").forEach(b => b.onclick = () => pick(b));
      if (timer) timer.stop();
      timer = countdown(s, st.querySelector("#rTime"), limit, { onEnd: () => pick(null) });
    };

    const pick = btn => {
      if (locked) return;
      locked = true;
      const left = timer ? timer.left() : 0;
      if (timer) timer.stop();
      const it = items[i];
      const ok = btn && btn.dataset.v === it.translation;
      st.querySelectorAll(".opt").forEach(b => {
        b.disabled = true;
        if (b.dataset.v === it.translation) b.classList.add("right");
        else if (b === btn) b.classList.add("wrong");
      });
      const fb = st.querySelector("#rFb");
      if (ok) {
        combo++; correct++;
        const pts = 10 + Math.round(left) + (combo >= 3 ? 5 : 0);
        score += pts;
        fb.innerHTML = `<b class="good">+${pts}</b> ${combo >= 3 ? `🔥 Комбо ×${combo}` : "Дұрыс!"}`;
      } else {
        combo = 0;
        fb.innerHTML = btn ? `<b class="bad">Қате.</b> Дұрысы: ${esc(it.translation)}` : `<b class="bad">Уақыт бітті.</b> Дұрысы: ${esc(it.translation)}`;
      }
      review.push({ q: it.word, a: it.translation, ok });
      ui.setScore(score);
      i++;
      s.later(show, ok ? 750 : 1600);
    };

    const onKey = e => {
      if (!s.alive()) { document.removeEventListener("keydown", onKey); return; }
      const n = +e.key;
      if (n >= 1 && n <= 4) { const b = st.querySelectorAll(".opt")[n - 1]; if (b && !b.disabled) pick(b); }
    };
    document.addEventListener("keydown", onKey);

    const end = () => {
      document.removeEventListener("keydown", onKey);
      showResult(root, this, { score, correct, total: items.length, xp: correct * 3 + Math.round(score / 20), max: items.length * 20, review },
        { onAgain: () => this.run(root, s) });
    };
    show();
  }
};
